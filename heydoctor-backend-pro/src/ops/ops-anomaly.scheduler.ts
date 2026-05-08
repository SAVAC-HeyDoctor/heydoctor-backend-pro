import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { notifyAlert } from '../common/alerts/alert.hooks';
import { OpsHttpMetricsService } from './ops-http-metrics.service';

/**
 * Umbrales operativos (ajustar por entorno). Desactivar con OPS_ANOMALY_ALERTS_ENABLED=false.
 */
const ERR_SPIKE = (): number =>
  Number(process.env.OPS_ANOMALY_ERROR_RATE ?? 0.05);
const LAT_HIGH_MS = (): number =>
  Number(process.env.OPS_ANOMALY_LATENCY_MS ?? 800);
const RPM_LOW = (): number => Number(process.env.OPS_ANOMALY_RPM_LOW ?? 20);
const RPM_TRAFFIC_BASE = (): number =>
  Number(process.env.OPS_ANOMALY_RPM_BASELINE ?? 30);
const P95_SPIKE_MS = (): number =>
  Number(process.env.OPS_ANOMALY_P95_MS ?? 1000);

@Injectable()
export class OpsAnomalyScheduler {
  private readonly logger = new Logger(OpsAnomalyScheduler.name);
  private lastRpm = -1;

  constructor(private readonly http: OpsHttpMetricsService) {}

  @Cron('0 */5 * * * *')
  async run(): Promise<void> {
    if (process.env.OPS_ANOMALY_ALERTS_ENABLED === 'false') {
      return;
    }
    try {
      const snap = await this.http.getSnapshot();
      const rpm = snap.requestsPerMinute;
      const er = snap.errorRate;
      const lat = snap.avgResponseTime;
      const p95 = snap.p95ResponseTime;

      if (er >= ERR_SPIKE()) {
        notifyAlert(
          {
            event: 'ops_error_spike',
            severity: 'critical',
            message: `Tasa de error HTTP ≥ ${(ERR_SPIKE() * 100).toFixed(0)}% (${(er * 100).toFixed(2)}%)`,
            errorRate: er,
          },
          { level: 'critical', key: 'ops:anomaly:error_spike' },
        );
      }

      if (lat >= LAT_HIGH_MS()) {
        notifyAlert(
          {
            event: 'ops_latency_high',
            severity: 'warning',
            message: `Latencia media elevada (${lat} ms ≥ ${LAT_HIGH_MS()} ms)`,
            avgResponseTime: lat,
          },
          { level: 'warning', key: 'ops:anomaly:latency' },
        );
      }

      if (p95 > P95_SPIKE_MS()) {
        notifyAlert(
          {
            event: 'latency_spike',
            severity: 'warning',
            message: `P95 de latencia > ${P95_SPIKE_MS()} ms (${p95} ms)`,
            p95ResponseTime: p95,
            p99ResponseTime: snap.p99ResponseTime,
          },
          { level: 'warning', key: 'ops:anomaly:latency_p95' },
        );
      }

      if (
        this.lastRpm >= RPM_TRAFFIC_BASE() &&
        rpm < RPM_LOW() &&
        this.lastRpm > 0
      ) {
        notifyAlert(
          {
            event: 'ops_traffic_drop',
            severity: 'warning',
            message: `Caída de tráfico: RPM ${rpm} (antes ${this.lastRpm}), umbral < ${RPM_LOW()}`,
            requestsPerMinute: rpm,
            previousRpm: this.lastRpm,
          },
          { level: 'warning', key: 'ops:anomaly:traffic_drop' },
        );
      }

      this.lastRpm = rpm;
    } catch (err) {
      this.logger.warn('ops_anomaly_check_failed', {
        event: 'ops_anomaly_check_failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
