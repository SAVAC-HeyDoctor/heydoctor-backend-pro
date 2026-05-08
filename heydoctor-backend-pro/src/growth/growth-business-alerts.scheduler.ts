import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { notifyAlert } from '../common/alerts/alert.hooks';
import { SubscriptionsAnalyticsService } from '../subscriptions/subscriptions-analytics.service';
import { GrowthFunnelEvents } from './growth-event-names';
import { GrowthAnalyticsService } from './growth-analytics.service';

const CONV_MIN = (): number =>
  Number(process.env.GROWTH_ALERT_SIGNUP_CONVERSION_MIN ?? 0.05);

const REV_DROP_RATIO = (): number =>
  Number(process.env.BUSINESS_ALERT_REVENUE_DROP_RATIO ?? 0.7);

const NO_PAYMENTS_HOUR_UTC = (): number =>
  Number(process.env.BUSINESS_ALERT_NO_PAYMENTS_HOUR_UTC ?? 8);

const REV_MIN_PRIOR_CLP = (): number =>
  Number(process.env.BUSINESS_ALERT_REVENUE_MIN_PRIOR_CLP ?? 1000);

function funnelHasVolume(f: Record<string, number>): boolean {
  let n = 0;
  for (const v of Object.values(f)) n += v;
  return n > 0;
}

function signupVolumeOk(f: Record<string, number>): boolean {
  const s = f[GrowthFunnelEvents.SIGNUP_COMPLETED] ?? 0;
  return s >= 20;
}

function utcMonthStartKey(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);
}

/**
 * Notifica a los sinks (p. ej. Slack) según {@link GrowthAnalyticsService.getAlerts}
 * y checks adicionales (ingresos mes cerrado, pagos del día, conversión signup→pago).
 * Cron fijo; desactivar con `GROWTH_BUSINESS_ALERTS_ENABLED=false`.
 */
@Injectable()
export class GrowthBusinessAlertsScheduler {
  private readonly logger = new Logger(GrowthBusinessAlertsScheduler.name);

  constructor(
    private readonly growthAnalytics: GrowthAnalyticsService,
    private readonly subscriptionsAnalytics: SubscriptionsAnalyticsService,
  ) {}

  /** Diario 13:00 UTC — evita ruido; ajustar en código si hace falta otra ventana. */
  @Cron('0 13 * * *')
  async runDailyBusinessChecks(): Promise<void> {
    if (process.env.GROWTH_BUSINESS_ALERTS_ENABLED === 'false') {
      return;
    }
    try {
      const alerts = await this.growthAnalytics.getAlerts();
      for (const a of alerts) {
        notifyAlert(
          {
            event: 'growth_business_alert',
            code: a.code,
            severity: a.severity,
            message: a.message,
            value: a.value,
          },
          {
            level: a.severity === 'critical' ? 'critical' : 'warning',
            key: `growth:${a.code}`,
          },
        );
      }

      await this.checkRevenueDropVsPriorClosedMonth();
      await this.checkNoPaymentsToday();
      await this.checkConversionDrop();

      const n = alerts.length;
      if (n > 0) {
        this.logger.log('growth_business_alerts_emitted', {
          event: 'growth_business_alerts_emitted',
          growthAlertCount: n,
        });
      }
    } catch (err) {
      this.logger.warn('growth_business_alerts_run_failed', {
        event: 'growth_business_alerts_run_failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Mes cerrado anterior vs el previo: caída fuerte de ingresos (PAYMENT_SUCCEEDED). */
  private async checkRevenueDropVsPriorClosedMonth(): Promise<void> {
    const mrr = await this.subscriptionsAnalytics.getMrr(24);
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const lastClosedKey = utcMonthStartKey(y, m - 1);
    const priorClosedKey = utcMonthStartKey(y, m - 2);
    const lastPt = mrr.series.find((s) => s.monthStart === lastClosedKey);
    const priorPt = mrr.series.find((s) => s.monthStart === priorClosedKey);
    const lastAmount = lastPt?.amount ?? 0;
    const priorAmount = priorPt?.amount ?? 0;
    const minPrior = REV_MIN_PRIOR_CLP();
    const ratio = REV_DROP_RATIO();

    if (priorAmount >= minPrior && lastAmount < priorAmount * ratio) {
      notifyAlert(
        {
          event: 'revenue_drop',
          severity: 'critical',
          message: `Ingresos PAYMENT_SUCCEEDED del mes cerrado ${lastClosedKey} < ${(ratio * 100).toFixed(0)}% del mes ${priorClosedKey}`,
          currentRevenue: lastAmount,
          prevRevenue: priorAmount,
          lastClosedMonth: lastClosedKey,
          priorClosedMonth: priorClosedKey,
        },
        { level: 'critical' },
      );
      this.logger.log('business_alert_revenue_drop', {
        event: 'business_alert_revenue_drop',
        lastClosedMonth: lastClosedKey,
        lastAmount,
        priorAmount,
      });
    }
  }

  /**
   * Cero pagos exitosos hoy (UTC) tras la hora configurada, si ayer hubo al menos uno.
   */
  private async checkNoPaymentsToday(): Promise<void> {
    const now = new Date();
    if (now.getUTCHours() < NO_PAYMENTS_HOUR_UTC()) {
      return;
    }

    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

    const [todayCount, yesterdayCount] = await Promise.all([
      this.subscriptionsAnalytics.countPaymentSucceededUtcDate(todayStart),
      this.subscriptionsAnalytics.countPaymentSucceededUtcDate(yesterdayStart),
    ]);

    if (todayCount === 0 && yesterdayCount > 0) {
      const dayUtc = todayStart.toISOString().slice(0, 10);
      notifyAlert(
        {
          event: 'no_payments_detected',
          severity: 'critical',
          message: `Cero pagos PAYMENT_SUCCEEDED en UTC ${dayUtc} (tras ${NO_PAYMENTS_HOUR_UTC()}:00 UTC), con pagos ayer: ${yesterdayCount}`,
          paymentsToday: todayCount,
          paymentsYesterday: yesterdayCount,
          dayUtc,
        },
        { level: 'critical' },
      );
      this.logger.log('business_alert_no_payments', {
        event: 'business_alert_no_payments',
        dayUtc,
      });
    }
  }

  /** Misma lógica que el antiguo LOW_SIGNUP_TO_PAID del cron, con evento explícito. */
  private async checkConversionDrop(): Promise<void> {
    const summary = await this.growthAnalytics.getSummary();
    const minConv = CONV_MIN();
    if (
      funnelHasVolume(summary.funnelDistinctUsers) &&
      signupVolumeOk(summary.funnelDistinctUsers) &&
      summary.signupToPaidApprox < minConv
    ) {
      notifyAlert(
        {
          event: 'conversion_drop',
          severity: 'warning',
          message: `Conversión signup→señales de pago baja (<${(minConv * 100).toFixed(1)}%) con volumen en ventana ${summary.windowDays}d`,
          signupConversion: summary.signupToPaidApprox,
          threshold: minConv,
        },
        { level: 'warning' },
      );
      this.logger.log('business_alert_conversion_drop', {
        event: 'business_alert_conversion_drop',
        value: summary.signupToPaidApprox,
      });
    }
  }
}
