import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';
import { PaykuPayment, PaykuPaymentStatus } from './payku-payment.entity';
import { PaykuFinancialReconciliation } from './payku-financial-reconciliation.entity';

type RevenueRow = {
  total: string;
  count: string;
};

type MissingSubscriptionRow = {
  payment_id: string;
};

type ActiveSubscriptionsRevenueRow = {
  total: string;
  count: string;
};

function previousUtcDate(): string {
  const now = new Date();
  const previous = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  return previous.toISOString().slice(0, 10);
}

function utcDayRange(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function decimalDifference(left: string, right: string): string {
  return (Number(left) - Number(right)).toFixed(2);
}

@Injectable()
export class PaykuReconciliationService {
  private readonly logger = new Logger(PaykuReconciliationService.name);

  constructor(
    @InjectRepository(PaykuFinancialReconciliation)
    private readonly repo: Repository<PaykuFinancialReconciliation>,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('0 5 * * *')
  async reconcilePreviousDay(): Promise<void> {
    try {
      await this.reconcileDay(previousUtcDate());
    } catch (err) {
      this.logger.error(
        'payku_reconciliation_failed',
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  async reconcileDay(day: string): Promise<PaykuFinancialReconciliation> {
    const { start, end } = utcDayRange(day);

    const paymentRevenue = await this.dataSource
      .getRepository(PaykuPayment)
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('payment.status = :status', { status: PaykuPaymentStatus.PAID })
      .andWhere('payment.paidAt >= :start', { start })
      .andWhere('payment.paidAt < :end', { end })
      .getRawOne<RevenueRow>();

    const activeSubscriptions = await this.dataSource.query<
      ActiveSubscriptionsRevenueRow[]
    >(
      `
        SELECT COALESCE(SUM(price), 0)::text AS total,
               COUNT(*)::text AS count
        FROM subscriptions
        WHERE plan = $1
          AND status = $2
      `,
      [SubscriptionPlan.PRO, SubscriptionStatus.ACTIVE],
    );

    const missingSubscriptions = await this.dataSource.query<
      MissingSubscriptionRow[]
    >(
      `
        SELECT p.id AS payment_id
        FROM payku_payments p
        LEFT JOIN subscriptions s
          ON s.user_id = p.user_id
         AND s.plan = $4
         AND s.status = $5
        WHERE p.status = $1
          AND p.consultation_id IS NULL
          AND p.paid_at >= $2
          AND p.paid_at < $3
          AND s.id IS NULL
        ORDER BY p.paid_at ASC
      `,
      [
        PaykuPaymentStatus.PAID,
        start,
        end,
        SubscriptionPlan.PRO,
        SubscriptionStatus.ACTIVE,
      ],
    );

    const paymentSucceededAmount = String(paymentRevenue?.total ?? '0');
    const activeSubscriptionsRevenue = String(
      activeSubscriptions[0]?.total ?? '0',
    );
    const mismatchAmount = decimalDifference(
      paymentSucceededAmount,
      activeSubscriptionsRevenue,
    );
    const missingSubscriptionPaymentIds = missingSubscriptions.map(
      (row) => row.payment_id,
    );

    const rows = await this.repo.query<PaykuFinancialReconciliation[]>(
      `
        INSERT INTO payku_financial_reconciliations (
          reconciliation_date,
          payment_succeeded_amount,
          active_subscriptions_revenue,
          mismatch_amount,
          missing_subscription_count,
          missing_subscription_payment_ids,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
        ON CONFLICT (reconciliation_date) DO UPDATE SET
          payment_succeeded_amount = EXCLUDED.payment_succeeded_amount,
          active_subscriptions_revenue = EXCLUDED.active_subscriptions_revenue,
          mismatch_amount = EXCLUDED.mismatch_amount,
          missing_subscription_count = EXCLUDED.missing_subscription_count,
          missing_subscription_payment_ids = EXCLUDED.missing_subscription_payment_ids,
          metadata = EXCLUDED.metadata,
          updated_at = now()
        RETURNING *
      `,
      [
        day,
        paymentSucceededAmount,
        activeSubscriptionsRevenue,
        mismatchAmount,
        missingSubscriptionPaymentIds.length,
        JSON.stringify(missingSubscriptionPaymentIds),
        JSON.stringify({
          source: 'payku_payments',
          paymentSucceededCount: Number(paymentRevenue?.count ?? 0),
          activeSubscriptionCount: Number(activeSubscriptions[0]?.count ?? 0),
        }),
      ],
    );

    if (mismatchAmount !== '0.00' || missingSubscriptionPaymentIds.length > 0) {
      this.logger.warn('payku_reconciliation_mismatch', {
        day,
        mismatchAmount,
        missingSubscriptionPaymentIds,
      });
    } else {
      this.logger.log('payku_reconciliation_ok', { day });
    }

    return rows[0];
  }
}
