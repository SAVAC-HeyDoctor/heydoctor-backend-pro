import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PaykuPaymentStatus } from '../payku/payku-payment.entity';
import { FinancialLedgerType } from '../payku/financial-ledger.entity';
import { getSocketIoRedisHealth } from '../common/websocket/socket-io-health';

type OutboxSummary = {
  pending: number;
  dueNow: number;
  scheduledForRetry: number;
  retrying: number;
  processed: number;
  deadLetter: number;
  oldestPendingCreatedAt: string | null;
  oldestDeadLetterCreatedAt: string | null;
  maxRetryCount: number;
};

type OutboxTypeSummary = {
  type: string;
  pending: number;
  retrying: number;
  deadLetter: number;
  oldestPendingCreatedAt: string | null;
};

type PaymentAsyncSummary = {
  pendingPayments: number;
  stalePendingPayments: number;
  paidPaymentsMissingLedger: number;
  paidPaymentsMissingSuccessOutbox: number;
  failedPaymentsMissingFailureOutbox: number;
};

type SchedulerDiagnostic = {
  name: string;
  cadence: string;
  enabled: boolean;
  idempotency: string;
  failureMode: string;
};

export type AsyncReliabilityDiagnostics = {
  generatedAt: string;
  outbox: {
    config: {
      pollIntervalMs: number;
      batchSize: number;
      maxAttempts: number;
      backoff: string;
      multiInstanceSafe: boolean;
    };
    summary: OutboxSummary;
    byType: OutboxTypeSummary[];
  };
  payments: PaymentAsyncSummary;
  redis: {
    socketIo: ReturnType<typeof getSocketIoRedisHealth>;
    redisUrlConfigured: boolean;
  };
  schedulers: SchedulerDiagnostic[];
  memoryOnlyState: string[];
  riskSummary: {
    status: 'ok' | 'needs_attention';
    risks: string[];
  };
};

type OutboxSummaryRow = {
  pending: string;
  due_now: string;
  scheduled_for_retry: string;
  retrying: string;
  processed: string;
  dead_letter: string;
  oldest_pending: Date | string | null;
  oldest_dead_letter: Date | string | null;
  max_retry_count: string | number | null;
};

type OutboxTypeSummaryRow = {
  type: string;
  pending: string;
  retrying: string;
  dead_letter: string;
  oldest_pending: Date | string | null;
};

type PaymentAsyncRow = {
  pending_payments: string;
  stale_pending_payments: string;
  paid_missing_ledger: string;
  paid_missing_success_outbox: string;
  failed_missing_failure_outbox: string;
};

const OUTBOX_POLL_INTERVAL_MS = 5_000;
const OUTBOX_BATCH_SIZE = 25;
const OUTBOX_MAX_ATTEMPTS = 5;

function envFlag(name: string, disabledValue = 'false'): boolean {
  return process.env[name] !== disabledValue;
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function toNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

@Injectable()
export class OpsAsyncReliabilityService {
  constructor(private readonly dataSource: DataSource) {}

  async getDiagnostics(): Promise<AsyncReliabilityDiagnostics> {
    const [outboxSummary, outboxByType, payments] = await Promise.all([
      this.outboxSummary(),
      this.outboxByType(),
      this.paymentAsyncSummary(),
    ]);
    const redisHealth = getSocketIoRedisHealth();
    const schedulers = this.schedulers();
    const risks = this.risks(outboxSummary, payments, redisHealth);

    return {
      generatedAt: new Date().toISOString(),
      outbox: {
        config: {
          pollIntervalMs: OUTBOX_POLL_INTERVAL_MS,
          batchSize: OUTBOX_BATCH_SIZE,
          maxAttempts: OUTBOX_MAX_ATTEMPTS,
          backoff: '2^retryCount seconds, persisted in next_attempt_at',
          multiInstanceSafe: true,
        },
        summary: outboxSummary,
        byType: outboxByType,
      },
      payments,
      redis: {
        socketIo: redisHealth,
        redisUrlConfigured: Boolean(process.env.REDIS_URL?.trim()),
      },
      schedulers,
      memoryOnlyState: [
        'EventOutboxService processing flag is per process; DB SKIP LOCKED provides cross-replica safety.',
        'AuditService abuse/status counters are in memory and not cluster-wide.',
        'Ops anomaly lastRpm is in memory and resets on deploy.',
        'Recent alert list is in memory unless backed by external alerting/Sentry.',
      ],
      riskSummary: {
        status: risks.length > 0 ? 'needs_attention' : 'ok',
        risks,
      },
    };
  }

  private async outboxSummary(): Promise<OutboxSummary> {
    const [row] = await this.dataSource.query<OutboxSummaryRow[]>(`
      SELECT
        COUNT(*) FILTER (WHERE processed = false AND failed = false)::text AS pending,
        COUNT(*) FILTER (
          WHERE processed = false
            AND failed = false
            AND (next_attempt_at IS NULL OR next_attempt_at <= now())
        )::text AS due_now,
        COUNT(*) FILTER (
          WHERE processed = false
            AND failed = false
            AND next_attempt_at > now()
        )::text AS scheduled_for_retry,
        COUNT(*) FILTER (
          WHERE processed = false
            AND failed = false
            AND retry_count > 0
        )::text AS retrying,
        COUNT(*) FILTER (WHERE processed = true)::text AS processed,
        COUNT(*) FILTER (WHERE failed = true)::text AS dead_letter,
        MIN(created_at) FILTER (
          WHERE processed = false AND failed = false
        ) AS oldest_pending,
        MIN(created_at) FILTER (WHERE failed = true) AS oldest_dead_letter,
        COALESCE(MAX(retry_count), 0)::text AS max_retry_count
      FROM event_outbox
    `);

    return {
      pending: toNumber(row?.pending),
      dueNow: toNumber(row?.due_now),
      scheduledForRetry: toNumber(row?.scheduled_for_retry),
      retrying: toNumber(row?.retrying),
      processed: toNumber(row?.processed),
      deadLetter: toNumber(row?.dead_letter),
      oldestPendingCreatedAt: toIso(row?.oldest_pending),
      oldestDeadLetterCreatedAt: toIso(row?.oldest_dead_letter),
      maxRetryCount: toNumber(row?.max_retry_count),
    };
  }

  private async outboxByType(): Promise<OutboxTypeSummary[]> {
    const rows = await this.dataSource.query<OutboxTypeSummaryRow[]>(`
      SELECT
        type,
        COUNT(*) FILTER (WHERE processed = false AND failed = false)::text AS pending,
        COUNT(*) FILTER (
          WHERE processed = false
            AND failed = false
            AND retry_count > 0
        )::text AS retrying,
        COUNT(*) FILTER (WHERE failed = true)::text AS dead_letter,
        MIN(created_at) FILTER (
          WHERE processed = false AND failed = false
        ) AS oldest_pending
      FROM event_outbox
      GROUP BY type
      ORDER BY type ASC
    `);

    return rows.map((row) => ({
      type: row.type,
      pending: toNumber(row.pending),
      retrying: toNumber(row.retrying),
      deadLetter: toNumber(row.dead_letter),
      oldestPendingCreatedAt: toIso(row.oldest_pending),
    }));
  }

  private async paymentAsyncSummary(): Promise<PaymentAsyncSummary> {
    const pendingExpireMinutes = numberFromEnv(
      'PAYMENT_PENDING_EXPIRE_MINUTES',
      30,
    );
    const [row] = await this.dataSource.query<PaymentAsyncRow[]>(
      `
        SELECT
          COUNT(*) FILTER (WHERE p.status = $1)::text AS pending_payments,
          COUNT(*) FILTER (
            WHERE p.status = $1
              AND p.created_at < now() - ($4 * interval '1 minute')
          )::text AS stale_pending_payments,
          COUNT(*) FILTER (
            WHERE p.status = $2
              AND l.id IS NULL
          )::text AS paid_missing_ledger,
          COUNT(*) FILTER (
            WHERE p.status = $2
              AND success_outbox.id IS NULL
          )::text AS paid_missing_success_outbox,
          COUNT(*) FILTER (
            WHERE p.status = $3
              AND failed_outbox.id IS NULL
          )::text AS failed_missing_failure_outbox
        FROM payku_payments p
        LEFT JOIN financial_ledger l
          ON l.reference_id = p.id
         AND l.type = $5
        LEFT JOIN event_outbox success_outbox
          ON success_outbox.idempotency_key = 'payku:' || p.id::text || ':payment_succeeded'
        LEFT JOIN event_outbox failed_outbox
          ON failed_outbox.idempotency_key = 'payku:' || p.id::text || ':payment_failed'
      `,
      [
        PaykuPaymentStatus.PENDING,
        PaykuPaymentStatus.PAID,
        PaykuPaymentStatus.FAILED,
        pendingExpireMinutes,
        FinancialLedgerType.CREDIT,
      ],
    );

    return {
      pendingPayments: toNumber(row?.pending_payments),
      stalePendingPayments: toNumber(row?.stale_pending_payments),
      paidPaymentsMissingLedger: toNumber(row?.paid_missing_ledger),
      paidPaymentsMissingSuccessOutbox: toNumber(
        row?.paid_missing_success_outbox,
      ),
      failedPaymentsMissingFailureOutbox: toNumber(
        row?.failed_missing_failure_outbox,
      ),
    };
  }

  private schedulers(): SchedulerDiagnostic[] {
    return [
      {
        name: 'event_outbox_process_pending',
        cadence: 'every 5 seconds',
        enabled: true,
        idempotency:
          'idempotency_key unique index + handler-level no-op writes',
        failureMode:
          'retry_count, next_attempt_at, failed dead-letter after 5 attempts',
      },
      {
        name: 'payku_stale_pending_reconciliation',
        cadence: 'every 10 minutes',
        enabled: process.env.PAYKU_RECONCILIATION_DISABLED !== 'true',
        idempotency: 'only pending payments can expire',
        failureMode: 'logs and retries on next cron tick',
      },
      {
        name: 'payku_financial_reconciliation',
        cadence: 'daily 05:00 UTC',
        enabled: true,
        idempotency: 'upsert by reconciliation_date',
        failureMode: 'logs and retries on next cron tick/manual reconcileDay',
      },
      {
        name: 'gdpr_confirmed_deletions',
        cadence: 'hourly',
        enabled: true,
        idempotency: 'status state machine pending/processing/completed/failed',
        failureMode: 'marks request failed and keeps row queryable',
      },
      {
        name: 'daily_metrics',
        cadence: 'daily 01:00 UTC',
        enabled: true,
        idempotency: 'expected daily aggregate overwrite/upsert semantics',
        failureMode: 'logs and retries on next cron tick',
      },
      {
        name: 'growth_business_alerts',
        cadence: 'daily 13:00 UTC',
        enabled: envFlag('GROWTH_BUSINESS_ALERTS_ENABLED'),
        idempotency: 'alert hooks are keyed for incident correlation',
        failureMode: 'logs warning; next run retries',
      },
      {
        name: 'ops_anomaly_alerts',
        cadence: 'every 5 minutes',
        enabled: envFlag('OPS_ANOMALY_ALERTS_ENABLED'),
        idempotency: 'alert hooks are keyed for incident correlation',
        failureMode: 'logs warning; next run retries',
      },
    ];
  }

  private risks(
    outbox: OutboxSummary,
    payments: PaymentAsyncSummary,
    redisHealth: ReturnType<typeof getSocketIoRedisHealth>,
  ): string[] {
    const risks: string[] = [];
    if (outbox.deadLetter > 0) {
      risks.push('outbox_dead_letters_present');
    }
    if (outbox.pending > OUTBOX_BATCH_SIZE * 10) {
      risks.push('outbox_backlog_high');
    }
    if (outbox.retrying > OUTBOX_BATCH_SIZE) {
      risks.push('outbox_retry_volume_high');
    }
    if (payments.stalePendingPayments > 0) {
      risks.push('stale_pending_payments_present');
    }
    if (payments.paidPaymentsMissingLedger > 0) {
      risks.push('paid_payments_missing_ledger');
    }
    if (payments.paidPaymentsMissingSuccessOutbox > 0) {
      risks.push('paid_payments_missing_success_outbox');
    }
    if (payments.failedPaymentsMissingFailureOutbox > 0) {
      risks.push('failed_payments_missing_failure_outbox');
    }
    if (
      process.env.NODE_ENV === 'production' &&
      redisHealth.redisConfigured &&
      redisHealth.status !== 'ready'
    ) {
      risks.push('redis_async_infrastructure_degraded');
    }
    return risks;
  }
}
