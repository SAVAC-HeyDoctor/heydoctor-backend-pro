import { Injectable } from '@nestjs/common';
import { DataSource, MoreThanOrEqual } from 'typeorm';
import { User } from '../users/user.entity';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from './subscription.entity';
import {
  SubscriptionEvent,
  SubscriptionEventType,
} from './subscription-event.entity';

export type SubscriptionsSummaryDto = {
  totalUsers: number;
  proUsers: number;
  inactivePro: number;
  /** Filas `subscriptions` con plan PRO y estado activo (tier efectivo aplicable en features). */
  activeSubscriptions: number;
};

export type SubscriptionsMetricsDto = {
  /** Suma de `metadata.amount` en eventos PAYMENT_SUCCEEDED del mes UTC actual (no es contabilidad oficial). */
  monthlyRevenue: number;
  /** Aproximación snapshot: `inactivePro / proUsers` (hasta haber eventos de churn explícitos). */
  churnRate: number;
  /** Eventos SUBSCRIPTION_CREATED del mes UTC actual. */
  newSubscriptions: number;
  /** Conteo de PAYMENT_SUCCEEDED en el mes UTC actual. */
  paymentSuccessCount: number;
};

@Injectable()
export class SubscriptionsAnalyticsService {
  constructor(private readonly dataSource: DataSource) {}

  async getSummary(): Promise<SubscriptionsSummaryDto> {
    const userRepo = this.dataSource.getRepository(User);
    const subRepo = this.dataSource.getRepository(Subscription);

    const totalUsers = await userRepo.count();
    const proUsers = await subRepo.count({
      where: { plan: SubscriptionPlan.PRO },
    });
    const inactivePro = await subRepo.count({
      where: {
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.INACTIVE,
      },
    });
    const activeSubscriptions = await subRepo.count({
      where: { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE },
    });

    return {
      totalUsers,
      proUsers,
      inactivePro,
      activeSubscriptions,
    };
  }

  async getMetrics(): Promise<SubscriptionsMetricsDto> {
    const summary = await this.getSummary();

    const startOfMonthUtc = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    );

    const eventRepo = this.dataSource.getRepository(SubscriptionEvent);

    const revenueRow = await eventRepo
      .createQueryBuilder('e')
      .select(
        `COALESCE(SUM(NULLIF(TRIM(e.metadata->>'amount'), '')::numeric), 0)`,
        'total',
      )
      .where('e.eventType = :et', {
        et: SubscriptionEventType.PAYMENT_SUCCEEDED,
      })
      .andWhere('e.createdAt >= :start', { start: startOfMonthUtc })
      .getRawOne<{ total: string }>();

    const monthlyRevenue = Number(revenueRow?.total ?? 0);

    const newSubscriptions = await eventRepo.count({
      where: {
        eventType: SubscriptionEventType.SUBSCRIPTION_CREATED,
        createdAt: MoreThanOrEqual(startOfMonthUtc),
      },
    });

    const paymentSuccessCount = await eventRepo.count({
      where: {
        eventType: SubscriptionEventType.PAYMENT_SUCCEEDED,
        createdAt: MoreThanOrEqual(startOfMonthUtc),
      },
    });

    const churnRate =
      summary.proUsers > 0 ? summary.inactivePro / summary.proUsers : 0;

    return {
      monthlyRevenue,
      churnRate,
      newSubscriptions,
      paymentSuccessCount,
    };
  }
}
