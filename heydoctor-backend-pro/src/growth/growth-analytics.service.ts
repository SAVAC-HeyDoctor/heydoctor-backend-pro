import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionsAnalyticsService } from '../subscriptions/subscriptions-analytics.service';
import { GrowthFunnelEvents } from './growth-event-names';
import { ProductEvent } from './product-event.entity';

const WINDOW_DAYS = 30;

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

const CHURN_CRITICAL = (): number =>
  Number(process.env.GROWTH_ALERT_CHURN_MAX ?? 0.15);

const SIGNUP_TOO_LOW_CONV = (): number =>
  Number(process.env.GROWTH_ALERT_SIGNUP_CONVERSION_MIN ?? 0.02);

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

  async funnelCounts(): Promise<Record<string, number>> {
    const since = this.since();
    const funnelKeys = Object.values(GrowthFunnelEvents);
    const counts: Record<string, number> = {};
    const rows = await this.events
      .createQueryBuilder('e')
      .select('e.event_name', 'name')
      .addSelect('COUNT(DISTINCT e.user_id)::int', 'cnt')
      .where('e.created_at >= :since', { since })
      .andWhere('e.user_id IS NOT NULL')
      .groupBy('e.event_name')
      .getRawMany<{ name: string; cnt: string }>();

    for (const k of funnelKeys) counts[k] = 0;
    for (const r of rows) {
      counts[r.name] = Number(r.cnt ?? 0);
    }
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
        'Basado en usuarios únicos en product_events (SIGNUP_COMPLETED vs PAYMENT_SUCCESS / SUBSCRIPTION_UPGRADE); emite estos eventos desde el cliente o servidor.',
      subscriptionTotals: {
        totalUsers: sub.totalUsers,
        proUsers: sub.proUsers,
        conversionProVsUsersApprox,
      },
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

    const summary = await this.getSummary();
    const minConv = SIGNUP_TOO_LOW_CONV();
    if (
      funnelHasVolume(summary.funnelDistinctUsers) &&
      signupVolumeOk(summary.funnelDistinctUsers) &&
      summary.signupToPaidApprox < minConv
    ) {
      alerts.push({
        code: 'LOW_SIGNUP_TO_PAID',
        severity: 'warning',
        message: `Conversión signup→señales de pago baja (<${(minConv * 100).toFixed(1)}%) con volumen.`,
        value: summary.signupToPaidApprox,
      });
    }

    return alerts;
  }
}

function funnelHasVolume(f: Record<string, number>): boolean {
  let n = 0;
  for (const v of Object.values(f)) n += v;
  return n > 0;
}

function signupVolumeOk(f: Record<string, number>): boolean {
  const s = f[GrowthFunnelEvents.SIGNUP_COMPLETED] ?? 0;
  return s >= 20;
}
