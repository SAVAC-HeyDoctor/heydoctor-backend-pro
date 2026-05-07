import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { notifyAlert } from '../common/alerts/alert.hooks';
import { GrowthAnalyticsService } from './growth-analytics.service';

/**
 * Notifica a los sinks (p. ej. Slack) según umbrales de {@link GrowthAnalyticsService.getAlerts}.
 * Cron fijo; desactivar con `GROWTH_BUSINESS_ALERTS_ENABLED=false`.
 */
@Injectable()
export class GrowthBusinessAlertsScheduler {
  private readonly logger = new Logger(GrowthBusinessAlertsScheduler.name);

  constructor(private readonly growthAnalytics: GrowthAnalyticsService) {}

  /** Diario 13:00 UTC — evita ruido; ajustar en código si hace falta otra ventana. */
  @Cron('0 13 * * *')
  async runDailyBusinessChecks(): Promise<void> {
    if (process.env.GROWTH_BUSINESS_ALERTS_ENABLED === 'false') {
      return;
    }
    try {
      const alerts = await this.growthAnalytics.getAlerts();
      for (const a of alerts) {
        notifyAlert({
          event: 'growth_business_alert',
          code: a.code,
          severity: a.severity,
          message: a.message,
          value: a.value,
        });
      }
      if (alerts.length > 0) {
        this.logger.log('growth_business_alerts_emitted', {
          event: 'growth_business_alerts_emitted',
          count: alerts.length,
        });
      }
    } catch (err) {
      this.logger.warn('growth_business_alerts_run_failed', {
        event: 'growth_business_alerts_run_failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
