import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionsAnalyticsService } from '../subscriptions/subscriptions-analytics.service';
import { GrowthFunnelEvents } from './growth-event-names';
import { ProductEvent } from './product-event.entity';

const WINDOW_DAYS = 30;
const RETENTION_COHORT_LOOKBACK_DAYS = 120;

export type GrowthSummaryDto = {
  windowDays: number;
  funnelDistinctUsers: Record<string, number>;
  signupToPaidApprox: number;
  signupToPaidNote: string;
  subscriptionTotals: {
    totalUsers: number;
    proUsers: number;
    conversionProVsUsersApprox: number;
  };
};

export type GrowthAlertDto = {
  code: string;
  severity: 'warning' | 'critical';
  message: string;
  value?: number;
};

export type GrowthFunnelConversionRates = {
  signupPerVisit: number | null;
  pricingPerSignup: number | null;
  upgradePerPricing: number | null;
  checkoutPerUpgrade: number | null;
  paymentPerCheckout: number | null;
  callPerPayment: number | null;
};

export type GrowthExperimentVariantSlice = {
  experimentKey: string;
  variants: Record<
    string,
    {
      viewPricingActors: number;
      clickUpgradeActors: number;
      clickThroughRate: number | null;
    }
  >;
};

export type GrowthFunnelDashboardDto = {
  windowDays: number;
  visits: number;
  signups: number;
  viewPricing: number;
  upgrades: number;
  startCheckout: number;
  payments: number;
  calls: number;
  conversionRates: GrowthFunnelConversionRates;
  experimentPricingUpgradeCta: GrowthExperimentVariantSlice;
};

export type GrowthRetentionBucketDto = {
  days: number;
  cohortEligible: number;
  retained: number;
  rate: number | null;
  note: string;
};

export type GrowthRetentionDto = {
  cohortLookbackDays: number;
  definition: string;
  buckets: GrowthRetentionBucketDto[];
};

const CHURN_CRITICAL = (): number =>
  Number(process.env.GROWTH_ALERT_CHURN_MAX ?? 0.15);

function distinctActorExpr(alias = 'e'): string {
  return `COALESCE(${alias}.user_id::text, ${alias}.properties->>'anonSessionId')`;
}

function safeRatio(num: number, den: number): number | null {
  if (den <= 0) return null;
  return num / den;
}

@Injectable()
export class GrowthAnalyticsService {
  constructor(
    @InjectRepository(ProductEvent)
    private readonly events: Repository<ProductEvent>,
    private readonly subscriptionsAnalytics: SubscriptionsAnalyticsService,
  ) {}

  private since(): Date {
    return new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  }

  private async countDistinctActors(
    eventName: string,
    since: Date,
    allowAnon: boolean,
  ): Promise<number> {
    const qb = this.events
      .createQueryBuilder('e')
      .select(`COUNT(DISTINCT (${distinctActorExpr('e')}))`, 'cnt')
      .where('e.created_at >= :since', { since })
      .andWhere('e.event_name = :eventName', { eventName });

    if (allowAnon) {
      qb.andWhere(
        "(e.user_id IS NOT NULL OR (e.properties->>'anonSessionId') IS NOT NULL)",
      );
    } else {
      qb.andWhere('e.user_id IS NOT NULL');
    }

    const row = await qb.getRawOne<{ cnt: string }>();
    return Number(row?.cnt ?? 0);
  }

  async funnelCounts(): Promise<Record<string, number>> {
    const since = this.since();
    const funnelKeys = Object.values(GrowthFunnelEvents);
    const counts: Record<string, number> = {};
    const rows = await this.events
      .createQueryBuilder('e')
      .select('e.event_name', 'name')
      .addSelect(`COUNT(DISTINCT (${distinctActorExpr('e')}))::int`, 'cnt')
      .where('e.created_at >= :since', { since })
      .andWhere(
        "(e.user_id IS NOT NULL OR (e.properties->>'anonSessionId') IS NOT NULL)",
      )
      .groupBy('e.event_name')
      .getRawMany<{ name: string; cnt: string }>();

    for (const k of funnelKeys) counts[k] = 0;
    for (const r of rows) {
      counts[r.name] = Number(r.cnt ?? 0);
    }
    const clickLegacy = counts[GrowthFunnelEvents.CLICK_UPGRADE] ?? 0;
    const clickNew = counts[GrowthFunnelEvents.CLICK_UPGRADE_CTA] ?? 0;
    counts[GrowthFunnelEvents.CLICK_UPGRADE_CTA] = Math.max(
      clickLegacy,
      clickNew,
    );
    return counts;
  }

  async getSummary(): Promise<GrowthSummaryDto> {
    const funnelDistinctUsers = await this.funnelCounts();
    const signups =
      funnelDistinctUsers[GrowthFunnelEvents.SIGNUP_COMPLETED] ?? 0;
    const paidSignals = Math.max(
      funnelDistinctUsers[GrowthFunnelEvents.PAYMENT_SUCCESS] ?? 0,
      funnelDistinctUsers[GrowthFunnelEvents.SUBSCRIPTION_UPGRADE] ?? 0,
    );
    const signupToPaidApprox = signups > 0 ? paidSignals / signups : 0;
    const sub = await this.subscriptionsAnalytics.getSummary();
    const conversionProVsUsersApprox =
      sub.totalUsers > 0 ? sub.proUsers / sub.totalUsers : 0;

    return {
      windowDays: WINDOW_DAYS,
      funnelDistinctUsers,
      signupToPaidApprox,
      signupToPaidNote:
        'Embudo VISIT→…→CALL en GET /admin/growth/funnel. signup→pago: usuarios únicos SIGNUP_COMPLETED vs PAYMENT_SUCCESS / SUBSCRIPTION_UPGRADE.',
      subscriptionTotals: {
        totalUsers: sub.totalUsers,
        proUsers: sub.proUsers,
        conversionProVsUsersApprox,
      },
    };
  }

  async getFunnelDashboard(): Promise<GrowthFunnelDashboardDto> {
    const since = this.since();
    const [
      visits,
      signups,
      viewPricing,
      upgrades,
      startCheckout,
      payments,
      calls,
    ] = await Promise.all([
      this.countDistinctActors(GrowthFunnelEvents.VISIT_MARKETING, since, true),
      this.countDistinctActors(
        GrowthFunnelEvents.SIGNUP_COMPLETED,
        since,
        false,
      ),
      this.countDistinctActors(
        GrowthFunnelEvents.VIEW_PRICING_PAGE,
        since,
        true,
      ),
      this.countDistinctActors(
        GrowthFunnelEvents.CLICK_UPGRADE_CTA,
        since,
        true,
      ),
      this.countDistinctActors(GrowthFunnelEvents.START_CHECKOUT, since, false),
      this.countDistinctActors(
        GrowthFunnelEvents.PAYMENT_SUCCESS,
        since,
        false,
      ),
      this.countDistinctActors(GrowthFunnelEvents.START_CALL, since, false),
    ]);

    const conversionRates: GrowthFunnelConversionRates = {
      signupPerVisit: safeRatio(signups, visits),
      pricingPerSignup: safeRatio(viewPricing, signups),
      upgradePerPricing: safeRatio(upgrades, viewPricing),
      checkoutPerUpgrade: safeRatio(startCheckout, upgrades),
      paymentPerCheckout: safeRatio(payments, startCheckout),
      callPerPayment: safeRatio(calls, payments),
    };

    const experimentPricingUpgradeCta = await this.getExperimentVariantSlice(
      'pricing_upgrade_cta',
      since,
    );

    return {
      windowDays: WINDOW_DAYS,
      visits,
      signups,
      viewPricing,
      upgrades,
      startCheckout,
      payments,
      calls,
      conversionRates,
      experimentPricingUpgradeCta,
    };
  }

  async getExperimentVariantSlice(
    experimentKey: string,
    since: Date,
  ): Promise<GrowthExperimentVariantSlice> {
    const sql = `
      WITH views AS (
        SELECT
          NULLIF(TRIM(e.properties->>'variant'), '') AS variant,
          ${distinctActorExpr('e')} AS actor
        FROM product_events e
        WHERE e.created_at >= $1
          AND e.event_name = $2
          AND (e.properties->>'experimentKey') = $3
          AND (e.user_id IS NOT NULL OR (e.properties->>'anonSessionId') IS NOT NULL)
      ),
      clicks AS (
        SELECT
          NULLIF(TRIM(e.properties->>'variant'), '') AS variant,
          ${distinctActorExpr('e')} AS actor
        FROM product_events e
        WHERE e.created_at >= $1
          AND e.event_name = $4
          AND (e.properties->>'experimentKey') = $3
          AND (e.user_id IS NOT NULL OR (e.properties->>'anonSessionId') IS NOT NULL)
      ),
      view_counts AS (
        SELECT variant, COUNT(DISTINCT actor)::int AS c
        FROM views
        WHERE variant IS NOT NULL
        GROUP BY variant
      ),
      click_counts AS (
        SELECT variant, COUNT(DISTINCT actor)::int AS c
        FROM clicks
        WHERE variant IS NOT NULL
        GROUP BY variant
      )
      SELECT
        COALESCE(v.variant, c.variant) AS variant,
        COALESCE(v.c, 0)::int AS views,
        COALESCE(c.c, 0)::int AS clicks
      FROM view_counts v
      FULL OUTER JOIN click_counts c ON c.variant = v.variant
    `;

    const rows = await this.events.manager.query<
      { variant: string; views: number; clicks: number }[]
    >(sql, [
      since,
      GrowthFunnelEvents.VIEW_PRICING_PAGE,
      experimentKey,
      GrowthFunnelEvents.CLICK_UPGRADE_CTA,
    ]);

    if (!rows.length) {
      return {
        experimentKey,
        variants: {},
      };
    }

    const variants: GrowthExperimentVariantSlice['variants'] = {};
    for (const r of rows) {
      if (!r.variant) continue;
      const v = Number(r.views ?? 0);
      const c = Number(r.clicks ?? 0);
      variants[r.variant] = {
        viewPricingActors: v,
        clickUpgradeActors: c,
        clickThroughRate: safeRatio(c, v),
      };
    }
    return { experimentKey, variants };
  }

  async getRetention(days: number[]): Promise<GrowthRetentionDto> {
    const horizonSet = [...new Set(days.filter((d) => d > 0))].sort(
      (a, b) => a - b,
    );
    const horizons = horizonSet.length ? horizonSet : [1, 7, 30];
    const cohortStart = new Date(
      Date.now() - RETENTION_COHORT_LOOKBACK_DAYS * 86_400_000,
    );

    const buckets: GrowthRetentionBucketDto[] = [];

    for (const H of horizons) {
      const nowMinusH = new Date(Date.now() - H * 86_400_000);
      const sql = `
        WITH first_call AS (
          SELECT user_id, MIN(created_at) AS fc
          FROM product_events
          WHERE event_name = $1 AND user_id IS NOT NULL
          GROUP BY user_id
        ),
        eligible AS (
          SELECT user_id, fc
          FROM first_call
          WHERE fc >= $2 AND fc <= $3
        )
        SELECT
          COUNT(*)::int AS eligible,
          COUNT(*) FILTER (WHERE retained)::int AS retained
        FROM (
          SELECT
            e.user_id,
            e.fc,
            EXISTS (
              SELECT 1
              FROM product_events x
              WHERE x.user_id = e.user_id
                AND x.created_at > e.fc + interval '1 second'
                AND x.created_at <= e.fc + make_interval(days => $4)
            ) AS retained
          FROM eligible e
        ) t
      `;

      const [row] = await this.events.manager.query<
        { eligible: number; retained: number }[]
      >(sql, [GrowthFunnelEvents.START_CALL, cohortStart, nowMinusH, H]);

      const eligible = Number(row?.eligible ?? 0);
      const retained = Number(row?.retained ?? 0);
      buckets.push({
        days: H,
        cohortEligible: eligible,
        retained,
        rate: safeRatio(retained, eligible),
        note: `Cohorte: primer START_CALL entre hace ${RETENTION_COHORT_LOOKBACK_DAYS}d y hace ${H}d; retención = otro product_event en (fc, fc+${H}d].`,
      });
    }

    return {
      cohortLookbackDays: RETENTION_COHORT_LOOKBACK_DAYS,
      definition:
        'Retención por actividad: tras el primer START_CALL del usuario, ¿hubo al menos un product_event distinto en los N días siguientes?',
      buckets,
    };
  }

  async getAlerts(): Promise<GrowthAlertDto[]> {
    const alerts: GrowthAlertDto[] = [];
    const churn = await this.subscriptionsAnalytics.getSubscriptionChurnReal(6);
    const rate = churn.lastClosedMonthChurnRateVsPayingBase;
    if (rate >= CHURN_CRITICAL()) {
      alerts.push({
        code: 'HIGH_CHURN',
        severity: rate >= 0.25 ? 'critical' : 'warning',
        message: `Churn real (último mes cerrado) ≥ umbral (${(CHURN_CRITICAL() * 100).toFixed(0)}%)`,
        value: rate,
      });
    }

    return alerts;
  }
}
