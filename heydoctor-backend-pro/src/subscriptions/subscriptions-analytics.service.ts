import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, And, LessThan, MoreThanOrEqual } from 'typeorm';
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

/** Subscripciones PRO activas con periodo válido vigente (`price`, `currentPeriodEnd`). */
export type SubscriptionMrrRealResponseDto = {
  mrr: number;
  payerCount: number;
  /** ISO date (UTC día) utilizado como corte temporal. */
  asOfDate: string;
};

export type SubscriptionMrrSeriesPointDto = {
  monthStart: string;
  mrr: number;
  payingProUsers: number;
};

export type SubscriptionMrrSeriesResponseDto = {
  monthsLookback: number;
  proMonthlyPrice: number;
  series: SubscriptionMrrSeriesPointDto[];
};

export type RealChurnMonthlyPointDto = {
  monthStart: string;
  churnEvents: number;
  payingProUsersAtMonthStart: number;
  churnRate: number;
};

export type SubscriptionChurnRealResponseDto = {
  monthsLookback: number;
  series: RealChurnMonthlyPointDto[];
  lastClosedMonthStart: string;
  lastClosedMonthChurnRateVsPayingBase: number;
};

export type ArpuResponseDto = {
  mrr: number;
  payerCount: number;
  arpu: number;
  asOfDate: string;
};

export type ArrResponseDto = {
  arr: number;
  mrr: number;
};

export type LtvResponseDto = {
  arpu: number;
  /** Churn del último mes calendario UTC cerrado (`churn-real`); 0 si no aplica. */
  lastClosedMonthlyChurnRate: number;
  ltvMonths: number;
  ltvAnnualizedFallback: boolean;
};

const METRICS_SUBSCRIPTION_EVENT_REPLAY_TYPES: SubscriptionEventType[] = [
  SubscriptionEventType.ADMIN_UPDATED,
  SubscriptionEventType.PLAN_UPGRADED,
  SubscriptionEventType.PLAN_DOWNGRADED,
  SubscriptionEventType.SUBSCRIPTION_CREATED,
  SubscriptionEventType.SUBSCRIPTION_ACTIVATED,
  SubscriptionEventType.SUBSCRIPTION_DEACTIVATED,
  SubscriptionEventType.SUBSCRIPTION_EXPIRED,
  SubscriptionEventType.PAYMENT_SUCCEEDED,
  SubscriptionEventType.SUBSCRIPTION_REACTIVATED,
];

@Injectable()
export class SubscriptionsAnalyticsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

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

  async getSubscriptionMrrReal(
    now: Date = new Date(),
  ): Promise<SubscriptionMrrRealResponseDto> {
    const subRepo = this.dataSource.getRepository(Subscription);
    const asOfDate = new Date(now);
    const row = await subRepo
      .createQueryBuilder('s')
      .select(
        `COALESCE(SUM(CAST(NULLIF(TRIM(s.price), '') AS DECIMAL)), 0)`,
        'mrr',
      )
      .addSelect('COUNT(*)', 'cnt')
      .where('s.plan = :pro', { pro: SubscriptionPlan.PRO })
      .andWhere('s.status = :active', { active: SubscriptionStatus.ACTIVE })
      .andWhere('s.currentPeriodEnd IS NOT NULL')
      .andWhere('s.currentPeriodEnd >= :now', { now })
      .getRawOne<{ mrr: string | null; cnt: string | null }>();

    return {
      mrr: Number(row?.mrr ?? 0),
      payerCount: Number(row?.cnt ?? 0),
      asOfDate: asOfDate.toISOString().slice(0, 10),
    };
  }

  async getSubscriptionMrrSeries(
    monthsLookback: number,
  ): Promise<SubscriptionMrrSeriesResponseDto> {
    const n = Math.min(Math.max(monthsLookback, 1), 36);
    const proMonthlyPrice = readProMonthlyPrice(this.configService);
    const now = new Date();

    const firstMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1),
    );

    const eventRepo = this.dataSource.getRepository(SubscriptionEvent);
    const replayEventsAll = await eventRepo.find({
      where: { eventType: In(METRICS_SUBSCRIPTION_EVENT_REPLAY_TYPES) },
      select: [
        'userId',
        'eventType',
        'previousPlan',
        'newPlan',
        'previousStatus',
        'newStatus',
        'createdAt',
      ],
      order: { createdAt: 'ASC' },
    });

    const preload: SubscriptionEvent[] = [];
    const rest: SubscriptionEvent[] = [];
    const firstTs = firstMonthStart.getTime();
    for (const ev of replayEventsAll) {
      if (ev.createdAt.getTime() < firstTs) preload.push(ev);
      else rest.push(ev);
    }

    const replayState = new Map<string, ReplayUserState>();

    const applyReplay = (ev: SubscriptionEvent): void => {
      const uid = ev.userId;
      const prev = replayState.get(uid);
      replayState.set(uid, applyReplayEvent(prev, ev));
    };

    for (const ev of preload) applyReplay(ev);

    const monthStarts: Date[] = [];
    for (let i = 0; i < n; i++) {
      monthStarts.push(addUtcMonths(firstMonthStart, i));
    }
    let iEv = 0;
    const series: SubscriptionMrrSeriesPointDto[] = [];

    for (let mi = 0; mi < n; mi++) {
      const monthStart = monthStarts[mi];
      const monthEnd = endOfUtcMonth(monthStart);
      while (
        iEv < rest.length &&
        rest[iEv].createdAt.getTime() <= monthEnd.getTime()
      ) {
        applyReplay(rest[iEv]);
        iEv++;
      }
      series.push(
        mrrSeriesPointFromStates(replayState, monthStart, proMonthlyPrice),
      );
    }

    return { monthsLookback: n, proMonthlyPrice, series };
  }

  async getSubscriptionChurnReal(
    monthsLookback: number,
    nowInput: Date = new Date(),
  ): Promise<SubscriptionChurnRealResponseDto> {
    const n = Math.min(Math.max(monthsLookback, 1), 36);
    const now = nowInput;

    const firstMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1),
    );

    const eventRepo = this.dataSource.getRepository(SubscriptionEvent);
    const replayEventsAll = await eventRepo.find({
      where: { eventType: In(METRICS_SUBSCRIPTION_EVENT_REPLAY_TYPES) },
      select: [
        'userId',
        'eventType',
        'previousPlan',
        'newPlan',
        'previousStatus',
        'newStatus',
        'createdAt',
      ],
      order: { createdAt: 'ASC' },
    });

    const churnTypes = [
      SubscriptionEventType.SUBSCRIPTION_DEACTIVATED,
      SubscriptionEventType.SUBSCRIPTION_EXPIRED,
    ];

    const churnAgg = await eventRepo
      .createQueryBuilder('e')
      .select(`date_trunc('month', e.createdAt)`, 'monthStart')
      .addSelect('COUNT(*)', 'cnt')
      .where('e.eventType IN (:...types)', {
        types: churnTypes,
      })
      .andWhere('e.createdAt >= :from', { from: firstMonthStart })
      .groupBy(`date_trunc('month', e.createdAt)`)
      .orderBy(`date_trunc('month', e.createdAt)`, 'ASC')
      .getRawMany<{ monthStart: Date; cnt: string }>();

    const churnCountByMonth = new Map<string, number>();
    for (const row of churnAgg) {
      const key = new Date(row.monthStart).toISOString().slice(0, 10);
      churnCountByMonth.set(key, Number(row.cnt ?? 0));
    }

    const preload: SubscriptionEvent[] = [];
    const rest: SubscriptionEvent[] = [];
    const firstTs = firstMonthStart.getTime();
    for (const ev of replayEventsAll) {
      if (ev.createdAt.getTime() < firstTs) preload.push(ev);
      else rest.push(ev);
    }

    const replayState = new Map<string, ReplayUserState>();
    const applyReplay = (ev: SubscriptionEvent): void => {
      const uid = ev.userId;
      const prev = replayState.get(uid);
      replayState.set(uid, applyReplayEvent(prev, ev));
    };

    for (const ev of preload) applyReplay(ev);

    let iEv = 0;
    const series: RealChurnMonthlyPointDto[] = [];

    for (let mi = 0; mi < n; mi++) {
      const monthStart = addUtcMonths(firstMonthStart, mi);
      const key = monthStart.toISOString().slice(0, 10);
      while (
        iEv < rest.length &&
        rest[iEv].createdAt.getTime() < monthStart.getTime()
      ) {
        applyReplay(rest[iEv]);
        iEv++;
      }
      const payingProUsersAtMonthStart = countPayingProAccounts(replayState);
      const churnEvents = churnCountByMonth.get(key) ?? 0;
      const churnRate =
        payingProUsersAtMonthStart > 0
          ? churnEvents / payingProUsersAtMonthStart
          : 0;
      series.push({
        monthStart: key,
        churnEvents,
        payingProUsersAtMonthStart,
        churnRate,
      });
    }

    const lastClosed = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const lastClosedKey = lastClosed.toISOString().slice(0, 10);
    const closedRow = series.find((s) => s.monthStart === lastClosedKey);
    const lastClosedMonthChurnRateVsPayingBase = closedRow?.churnRate ?? 0;

    return {
      monthsLookback: n,
      series,
      lastClosedMonthStart: lastClosedKey,
      lastClosedMonthChurnRateVsPayingBase,
    };
  }

  async getArpu(now: Date = new Date()): Promise<ArpuResponseDto> {
    const { mrr, payerCount, asOfDate } =
      await this.getSubscriptionMrrReal(now);
    return {
      mrr,
      payerCount,
      arpu: payerCount > 0 ? mrr / payerCount : 0,
      asOfDate,
    };
  }

  async getArr(now: Date = new Date()): Promise<ArrResponseDto> {
    const { mrr } = await this.getSubscriptionMrrReal(now);
    return { arr: mrr * 12, mrr };
  }

  async getLtv(now: Date = new Date()): Promise<LtvResponseDto> {
    const arpuDto = await this.getArpu(now);
    const churnReal = await this.getSubscriptionChurnReal(24, now);
    const rate = churnReal.lastClosedMonthChurnRateVsPayingBase;
    if (rate > 0) {
      return {
        arpu: arpuDto.arpu,
        lastClosedMonthlyChurnRate: rate,
        ltvMonths: arpuDto.arpu / rate,
        ltvAnnualizedFallback: false,
      };
    }
    return {
      arpu: arpuDto.arpu,
      lastClosedMonthlyChurnRate: 0,
      ltvMonths: arpuDto.arpu * 12,
      ltvAnnualizedFallback: true,
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

  /**
   * Conteo de PAYMENT_SUCCEEDED en el día calendario UTC de `day` (00:00–24:00 UTC).
   */
  async countPaymentSucceededUtcDate(day: Date): Promise<number> {
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth();
    const d = day.getUTCDate();
    const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
    const eventRepo = this.dataSource.getRepository(SubscriptionEvent);
    return eventRepo.count({
      where: {
        eventType: SubscriptionEventType.PAYMENT_SUCCEEDED,
        createdAt: And(MoreThanOrEqual(start), LessThan(end)),
      },
    });
  }
}

type ReplayUserState = {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
};

function readProMonthlyPrice(cfg: ConfigService): number {
  const v = cfg.get<string>('SUBSCRIPTION_PRO_MONTHLY_PRICE');
  const n = Number(v ?? '0');
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function applyReplayEvent(
  prev: ReplayUserState | undefined,
  ev: SubscriptionEvent,
): ReplayUserState {
  const cur = prev ?? {
    plan: SubscriptionPlan.FREE,
    status: SubscriptionStatus.INACTIVE,
  };

  switch (ev.eventType) {
    case SubscriptionEventType.ADMIN_UPDATED:
    case SubscriptionEventType.PAYMENT_SUCCEEDED:
      return {
        plan: ev.newPlan ?? cur.plan,
        status: ev.newStatus ?? cur.status,
      };
    case SubscriptionEventType.SUBSCRIPTION_CREATED:
      return {
        plan: ev.newPlan ?? SubscriptionPlan.FREE,
        status: ev.newStatus ?? SubscriptionStatus.ACTIVE,
      };
    case SubscriptionEventType.SUBSCRIPTION_ACTIVATED:
    case SubscriptionEventType.SUBSCRIPTION_REACTIVATED:
      return {
        plan: ev.newPlan ?? cur.plan,
        status: SubscriptionStatus.ACTIVE,
      };
    case SubscriptionEventType.SUBSCRIPTION_DEACTIVATED:
    case SubscriptionEventType.SUBSCRIPTION_EXPIRED:
      return {
        plan: ev.newPlan ?? cur.plan,
        status: SubscriptionStatus.INACTIVE,
      };
    case SubscriptionEventType.PLAN_UPGRADED:
      return {
        plan: ev.newPlan ?? SubscriptionPlan.PRO,
        status: ev.newStatus ?? cur.status,
      };
    case SubscriptionEventType.PLAN_DOWNGRADED:
      return {
        plan: ev.newPlan ?? SubscriptionPlan.FREE,
        status: ev.newStatus ?? cur.status,
      };
    default:
      return cur;
  }
}

function countPayingProAccounts(states: Map<string, ReplayUserState>): number {
  let k = 0;
  for (const [, st] of states) {
    if (
      st.plan === SubscriptionPlan.PRO &&
      st.status === SubscriptionStatus.ACTIVE
    ) {
      k += 1;
    }
  }
  return k;
}

function mrrSeriesPointFromStates(
  states: Map<string, ReplayUserState>,
  monthStart: Date,
  monthlyPrice: number,
): SubscriptionMrrSeriesPointDto {
  const payingProUsers = countPayingProAccounts(states);
  return {
    monthStart: monthStart.toISOString().slice(0, 10),
    mrr: payingProUsers * monthlyPrice,
    payingProUsers,
  };
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
