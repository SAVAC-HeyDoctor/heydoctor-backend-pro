import { Injectable } from '@nestjs/common';
import { DataSource, In, MoreThanOrEqual } from 'typeorm';
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

export type MrrSeriesPointDto = {
  monthStart: string;
  amount: number;
  paymentCount: number;
};

export type MrrResponseDto = {
  monthsLookback: number;
  /** Suma PAYMENT_SUCCEEDED del mes calendario UTC actual. */
  currentMonthAmount: number;
  series: MrrSeriesPointDto[];
};

export type ChurnMonthlyPointDto = {
  monthStart: string;
  subscriptionDeactivated: number;
  subscriptionExpired: number;
  churnEventsTotal: number;
};

export type ChurnResponseDto = {
  monthsLookback: number;
  series: ChurnMonthlyPointDto[];
  totals: {
    subscriptionDeactivated: number;
    subscriptionExpired: number;
  };
  /** Primer día del último mes calendario UTC ya cerrado. */
  lastClosedMonthStart: string;
  /**
   * (deactivated+expired en ese mes) / max(proUsers actual, 1).
   * Denominador es snapshot de PRO en DB, no base “activos al inicio de mes”.
   */
  lastClosedMonthChurnRateVsProBase: number;
};

export type CohortHorizonDto = {
  offsetMonths: number;
  retainedUsers: number;
  retentionRate: number;
};

export type CohortRowDto = {
  cohortMonth: string;
  signups: number;
  horizons: CohortHorizonDto[];
};

export type CohortsResponseDto = {
  cohortMonthsLookback: number;
  horizonMonths: number;
  cohorts: CohortRowDto[];
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

  async getMrr(monthsLookback: number): Promise<MrrResponseDto> {
    const n = Math.min(Math.max(monthsLookback, 1), 36);
    const now = new Date();
    const from = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1),
    );

    const eventRepo = this.dataSource.getRepository(SubscriptionEvent);

    const rows = await eventRepo
      .createQueryBuilder('e')
      .select(`date_trunc('month', e.createdAt)`, 'monthStart')
      .addSelect(
        `COALESCE(SUM(NULLIF(TRIM(e.metadata->>'amount'), '')::numeric), 0)`,
        'amount',
      )
      .addSelect('COUNT(*)', 'paymentCount')
      .where('e.eventType = :et', {
        et: SubscriptionEventType.PAYMENT_SUCCEEDED,
      })
      .andWhere('e.createdAt >= :from', { from })
      .groupBy(`date_trunc('month', e.createdAt)`)
      .orderBy(`date_trunc('month', e.createdAt)`, 'ASC')
      .getRawMany<{
        monthStart: Date;
        amount: string;
        paymentCount: string;
      }>();

    const series: MrrSeriesPointDto[] = rows.map((r) => ({
      monthStart: new Date(r.monthStart).toISOString().slice(0, 10),
      amount: Number(r.amount ?? 0),
      paymentCount: Number(r.paymentCount ?? 0),
    }));

    const currentMonthKey = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    )
      .toISOString()
      .slice(0, 10);
    const currentPoint = series.find((s) => s.monthStart === currentMonthKey);
    const currentMonthAmount = currentPoint?.amount ?? 0;

    return {
      monthsLookback: n,
      currentMonthAmount,
      series,
    };
  }

  async getChurn(monthsLookback: number): Promise<ChurnResponseDto> {
    const n = Math.min(Math.max(monthsLookback, 1), 36);
    const summary = await this.getSummary();

    const now = new Date();
    const from = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1),
    );

    const eventRepo = this.dataSource.getRepository(SubscriptionEvent);

    const rows = await eventRepo
      .createQueryBuilder('e')
      .select(`date_trunc('month', e.createdAt)`, 'monthStart')
      .addSelect(
        `SUM(CASE WHEN e.eventType = :deact THEN 1 ELSE 0 END)`,
        'deactivated',
      )
      .addSelect(
        `SUM(CASE WHEN e.eventType = :exp THEN 1 ELSE 0 END)`,
        'expired',
      )
      .where('e.eventType IN (:...types)', {
        types: [
          SubscriptionEventType.SUBSCRIPTION_DEACTIVATED,
          SubscriptionEventType.SUBSCRIPTION_EXPIRED,
        ],
      })
      .andWhere('e.createdAt >= :from', { from })
      .setParameter('deact', SubscriptionEventType.SUBSCRIPTION_DEACTIVATED)
      .setParameter('exp', SubscriptionEventType.SUBSCRIPTION_EXPIRED)
      .groupBy(`date_trunc('month', e.createdAt)`)
      .orderBy(`date_trunc('month', e.createdAt)`, 'ASC')
      .getRawMany<{
        monthStart: Date;
        deactivated: string | null;
        expired: string | null;
      }>();

    let totalDeactivated = 0;
    let totalExpired = 0;

    const series: ChurnMonthlyPointDto[] = rows.map((r) => {
      const d = Number(r.deactivated ?? 0);
      const ex = Number(r.expired ?? 0);
      totalDeactivated += d;
      totalExpired += ex;
      const monthStart = new Date(r.monthStart).toISOString().slice(0, 10);
      return {
        monthStart,
        subscriptionDeactivated: d,
        subscriptionExpired: ex,
        churnEventsTotal: d + ex,
      };
    });

    const lastClosed = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const lastClosedKey = lastClosed.toISOString().slice(0, 10);
    const closedRow = series.find((s) => s.monthStart === lastClosedKey);
    const closedTotal = closedRow?.churnEventsTotal ?? 0;
    const denom = Math.max(summary.proUsers, 1);
    const lastClosedMonthChurnRateVsProBase = closedTotal / denom;

    return {
      monthsLookback: n,
      series,
      totals: {
        subscriptionDeactivated: totalDeactivated,
        subscriptionExpired: totalExpired,
      },
      lastClosedMonthStart: lastClosedKey,
      lastClosedMonthChurnRateVsProBase,
    };
  }

  async getCohorts(params: {
    cohortMonthsLookback: number;
    horizonMonths: number;
  }): Promise<CohortsResponseDto> {
    const cohortMonthsLookback = Math.min(
      Math.max(params.cohortMonthsLookback, 1),
      36,
    );
    const horizonMonths = Math.min(Math.max(params.horizonMonths, 1), 12);

    const eventRepo = this.dataSource.getRepository(SubscriptionEvent);

    const signupRows = await eventRepo
      .createQueryBuilder('e')
      .select('e.userId', 'userId')
      .addSelect('MIN(e.createdAt)', 'firstAt')
      .where('e.eventType = :t', {
        t: SubscriptionEventType.SUBSCRIPTION_CREATED,
      })
      .groupBy('e.userId')
      .getRawMany<{ userId: string; firstAt: Date | string }>();

    const deactivateRows = await eventRepo.find({
      where: {
        eventType: In([
          SubscriptionEventType.SUBSCRIPTION_DEACTIVATED,
          SubscriptionEventType.SUBSCRIPTION_EXPIRED,
        ]),
      },
      select: ['userId', 'createdAt'],
      order: { createdAt: 'ASC' },
    });

    const firstDeactivate = new Map<string, Date>();
    for (const row of deactivateRows) {
      if (!firstDeactivate.has(row.userId)) {
        firstDeactivate.set(row.userId, row.createdAt);
      }
    }

    const cutoff = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth() - (cohortMonthsLookback - 1),
        1,
      ),
    );

    const cohortToUsers = new Map<number, Set<string>>();
    for (const row of signupRows) {
      const firstAt = new Date(row.firstAt);
      if (firstAt < cutoff) continue;
      const cohortStart = new Date(
        Date.UTC(firstAt.getUTCFullYear(), firstAt.getUTCMonth(), 1),
      );
      const key = cohortStart.getTime();
      if (!cohortToUsers.has(key)) {
        cohortToUsers.set(key, new Set());
      }
      cohortToUsers.get(key)!.add(row.userId);
    }

    const cohortKeys = [...cohortToUsers.keys()].sort((a, b) => b - a);

    const cohorts: CohortRowDto[] = cohortKeys.map((key) => {
      const cohortStart = new Date(key);
      const userIds = [...cohortToUsers.get(key)!];
      const signups = userIds.length;
      const horizons: CohortHorizonDto[] = [];

      for (let offset = 0; offset < horizonMonths; offset++) {
        const periodEnd = endOfUtcMonth(addUtcMonths(cohortStart, offset));
        let retained = 0;
        for (const uid of userIds) {
          const fd = firstDeactivate.get(uid);
          if (!fd || fd.getTime() > periodEnd.getTime()) {
            retained += 1;
          }
        }
        horizons.push({
          offsetMonths: offset,
          retainedUsers: retained,
          retentionRate: signups > 0 ? retained / signups : 0,
        });
      }

      return {
        cohortMonth: cohortStart.toISOString().slice(0, 10),
        signups,
        horizons,
      };
    });

    return {
      cohortMonthsLookback,
      horizonMonths,
      cohorts,
    };
  }
}

function addUtcMonths(start: Date, offset: number): Date {
  return new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1),
  );
}

function endOfUtcMonth(monthStart: Date): Date {
  return new Date(
    Date.UTC(
      monthStart.getUTCFullYear(),
      monthStart.getUTCMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  );
}
