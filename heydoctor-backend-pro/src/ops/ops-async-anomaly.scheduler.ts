import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { notifyAlert } from '../common/alerts/alert.hooks';
import { EventOutbox } from '../outbox/event-outbox.entity';
import {
  PaykuPayment,
  PaykuPaymentStatus,
} from '../payku/payku-payment.entity';
import { OpsAsyncMetricsService } from './ops-async-metrics.service';
import { OpsDeadLettersService } from './ops-dead-letters.service';
import { OpsHttpMetricsService } from './ops-http-metrics.service';

const RETRY_RATE_MAX = (): number =>
  Number(process.env.OPS_ASYNC_RETRY_RATE_MAX ?? 0.4);
const DEAD_LETTER_RATE_MAX = (): number =>
  Number(process.env.OPS_ASYNC_DEAD_LETTER_RATE_MAX ?? 0.1);
const PAYMENT_BACKLOG_MAX = (): number =>
  Number(process.env.OPS_PAYMENT_BACKLOG_MAX ?? 100);
const WEBHOOK_FAIL_RATE_MAX = (): number =>
  Number(process.env.OPS_WEBHOOK_FAILURE_RATE_MAX ?? 0.15);
const STUCK_RETRY_MS = Number(
  process.env.ASYNC_OUTBOX_STUCK_RETRY_MS ?? 15 * 60 * 1000,
);
const QUEUE_LAG_MS_MAX = (): number =>
  Number(process.env.OPS_QUEUE_LAG_MS_MAX ?? 120_000);

@Injectable()
export class OpsAsyncAnomalyScheduler {
  private readonly logger = new Logger(OpsAsyncAnomalyScheduler.name);

  constructor(
    private readonly asyncMetrics: OpsAsyncMetricsService,
    private readonly httpMetrics: OpsHttpMetricsService,
    private readonly deadLetters: OpsDeadLettersService,
    @InjectRepository(EventOutbox)
    private readonly outboxRepo: Repository<EventOutbox>,
    @InjectRepository(PaykuPayment)
    private readonly paymentsRepo: Repository<PaykuPayment>,
  ) {}

  @Cron('0 */5 * * * *')
  async run(): Promise<void> {
    if (process.env.OPS_ASYNC_ANOMALY_ALERTS_ENABLED === 'false') {
      return;
    }
    try {
      const stuckCutoff = new Date(Date.now() - STUCK_RETRY_MS);
      const [metrics, stuck, pendingCount, httpSnap, queueLagMs] =
        await Promise.all([
          this.asyncMetrics.getDistributedSnapshot(),
          this.outboxRepo
            .createQueryBuilder('e')
            .where('e.processed = false AND e.failed = false')
            .andWhere('e.retryCount > 0')
            .andWhere('e.nextAttemptAt < :cutoff', { cutoff: stuckCutoff })
            .getCount(),
          this.paymentsRepo.count({
            where: { status: PaykuPaymentStatus.PENDING },
          }),
          this.httpMetrics.getSnapshot(),
          this.deadLetters.getQueueLagMs(),
        ]);

      if (queueLagMs >= QUEUE_LAG_MS_MAX()) {
        notifyAlert(
          {
            event: 'ops_outbox_queue_lag',
            severity: 'warning',
            message: `Lag outbox SQL elevado (${Math.round(queueLagMs / 1000)}s promedio)`,
            queueLagMs,
          },
          { level: 'warning', key: 'ops:async:queue_lag' },
        );
      }

      if (metrics.retryRate >= RETRY_RATE_MAX()) {
        notifyAlert(
          {
            event: 'ops_async_excessive_retries',
            severity: 'warning',
            message: `Tasa de reintentos outbox elevada (${(metrics.retryRate * 100).toFixed(1)}%)`,
            retryRate: metrics.retryRate,
          },
          { level: 'warning', key: 'ops:async:retry_rate' },
        );
      }

      if (metrics.deadLetterRate >= DEAD_LETTER_RATE_MAX()) {
        notifyAlert(
          {
            event: 'ops_async_dead_letter_spike',
            severity: 'critical',
            message: `Dead-letter rate elevada (${(metrics.deadLetterRate * 100).toFixed(1)}%)`,
            deadLetterRate: metrics.deadLetterRate,
          },
          { level: 'critical', key: 'ops:async:dead_letter' },
        );
      }

      if (pendingCount >= PAYMENT_BACKLOG_MAX()) {
        notifyAlert(
          {
            event: 'ops_payment_backlog',
            severity: 'warning',
            message: `Backlog de pagos pending: ${pendingCount}`,
            pendingPayments: pendingCount,
          },
          { level: 'warning', key: 'ops:async:payment_backlog' },
        );
      }

      const webhook = httpSnap.errorsByEndpoint.find((e) =>
        e.path.includes('payku/webhook'),
      );
      const webhookFailRate =
        webhook && webhook.requestCount > 0
          ? webhook.errorRate
          : metrics.webhookFailureRate;
      if (webhookFailRate >= WEBHOOK_FAIL_RATE_MAX()) {
        notifyAlert(
          {
            event: 'ops_webhook_failure_spike',
            severity: 'critical',
            message: `Fallos webhook Payku elevados (${(webhookFailRate * 100).toFixed(1)}%)`,
            webhookFailureRate: webhookFailRate,
          },
          { level: 'critical', key: 'ops:async:webhook_fail' },
        );
      }

      if (stuck > 0) {
        notifyAlert(
          {
            event: 'ops_async_stuck_retries',
            severity: 'warning',
            message: `${stuck} evento(s) outbox con reintentos atascados`,
            stuckRetries: stuck,
          },
          { level: 'warning', key: 'ops:async:stuck' },
        );
      }
    } catch (err) {
      this.logger.warn('ops_async_anomaly_failed', {
        event: 'ops_async_anomaly_failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
