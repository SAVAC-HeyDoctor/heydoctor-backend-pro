import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  extractTraceRequestId,
  extractTraceSource,
} from '../common/observability/trace-envelope.util';
import {
  sanitizeErrorMessage,
  sanitizeOutboxPayload,
} from '../common/phi/phi-safe-payload.util';
import { EventOutbox } from '../outbox/event-outbox.entity';
import {
  PaykuPayment,
  PaykuPaymentStatus,
} from '../payku/payku-payment.entity';
import type { DeadLetterItemDto, DeadLettersDto } from './ops-dead-letters.dto';
import { OpsAsyncMetricsService } from './ops-async-metrics.service';
import { OpsHttpMetricsService } from './ops-http-metrics.service';

const OUTBOX_MAX_ATTEMPTS = 5;
const STUCK_RETRY_MS = Number(
  process.env.ASYNC_OUTBOX_STUCK_RETRY_MS ?? 15 * 60 * 1000,
);

@Injectable()
export class OpsDeadLettersService {
  constructor(
    private readonly asyncMetrics: OpsAsyncMetricsService,
    private readonly httpMetrics: OpsHttpMetricsService,
    @InjectRepository(EventOutbox)
    private readonly outboxRepo: Repository<EventOutbox>,
    @InjectRepository(PaykuPayment)
    private readonly paymentsRepo: Repository<PaykuPayment>,
  ) {}

  async getQueueLagMs(): Promise<number> {
    const row = await this.outboxRepo
      .createQueryBuilder('e')
      .select('AVG(EXTRACT(EPOCH FROM (NOW() - e.createdAt)) * 1000)', 'lagMs')
      .where('e.processed = false')
      .getRawOne<{ lagMs: string | null }>();
    return Math.round(Number(row?.lagMs ?? 0));
  }

  async getDeadLetters(): Promise<DeadLettersDto> {
    const stuckCutoff = new Date(Date.now() - STUCK_RETRY_MS);

    const [
      failedRows,
      retryExhausted,
      poisonEvents,
      stuckRetries,
      pendingPayments,
      queueLagRow,
      httpSnap,
    ] = await Promise.all([
      this.outboxRepo.find({
        where: { failed: true, processed: false },
        order: { createdAt: 'DESC' },
        take: 50,
      }),
      this.outboxRepo.count({
        where: {
          failed: true,
          processed: false,
          retryCount: OUTBOX_MAX_ATTEMPTS,
        },
      }),
      this.outboxRepo
        .createQueryBuilder('e')
        .where('e.failed = true AND e.processed = false')
        .andWhere('e.retryCount < :max', { max: OUTBOX_MAX_ATTEMPTS })
        .andWhere("e.lastError ILIKE '%Invalid%'")
        .getCount(),
      this.outboxRepo
        .createQueryBuilder('e')
        .where('e.processed = false AND e.failed = false')
        .andWhere('e.retryCount > 0')
        .andWhere('e.nextAttemptAt IS NOT NULL')
        .andWhere('e.nextAttemptAt < :cutoff', { cutoff: stuckCutoff })
        .getCount(),
      this.paymentsRepo.count({
        where: { status: PaykuPaymentStatus.PENDING },
      }),
      this.outboxRepo
        .createQueryBuilder('e')
        .select(
          'AVG(EXTRACT(EPOCH FROM (NOW() - e.createdAt)) * 1000)',
          'lagMs',
        )
        .where('e.processed = false')
        .getRawOne<{ lagMs: string | null }>(),
      this.httpMetrics.getSnapshot(),
    ]);

    const distributed = await this.asyncMetrics.getDistributedSnapshot();
    const local = this.asyncMetrics.getSnapshot();

    const webhookPath = httpSnap.errorsByEndpoint.find((e) =>
      e.path.includes('payku/webhook'),
    );
    const webhookFailureRate =
      webhookPath && webhookPath.requestCount > 0
        ? webhookPath.errorRate
        : distributed.webhookFailureRate;

    const stuckRows = await this.outboxRepo
      .createQueryBuilder('e')
      .where('e.processed = false AND e.failed = false')
      .andWhere('e.retry_count > 0')
      .andWhere('e.next_attempt_at IS NOT NULL')
      .andWhere('e.next_attempt_at < :cutoff', { cutoff: stuckCutoff })
      .orderBy('e.createdAt', 'ASC')
      .take(20)
      .getMany();

    const items: DeadLetterItemDto[] = [
      ...failedRows.map((r) => this.toFailedItem(r)),
      ...stuckRows.map((r) => this.toStuckItem(r)),
    ].slice(0, 50);

    return {
      summary: {
        failedOutboxEvents: failedRows.length,
        retryExhausted,
        poisonEvents,
        stuckRetries,
        pendingPayments,
      },
      metrics: {
        retryRate: distributed.retryRate || local.retryRate,
        deadLetterRate: distributed.deadLetterRate || local.deadLetterRate,
        webhookFailureRate,
        queueLagMs: Math.round(Number(queueLagRow?.lagMs ?? 0)),
        eventProcessingLatencyMs: local.eventProcessingLatencyMs,
      },
      items,
    };
  }

  private toFailedItem(row: EventOutbox): DeadLetterItemDto {
    const exhausted = row.retryCount >= OUTBOX_MAX_ATTEMPTS;
    return {
      id: row.id,
      eventType: row.type,
      status: 'failed',
      failureReason: exhausted
        ? 'retry_exhausted'
        : row.lastError?.includes('Invalid')
          ? 'poison'
          : 'failed',
      attemptCount: row.retryCount,
      maxAttempts: OUTBOX_MAX_ATTEMPTS,
      lastError: row.lastError ? sanitizeErrorMessage(row.lastError) : null,
      requestId: extractTraceRequestId(row.payload) ?? null,
      traceSource: extractTraceSource(row.payload) ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.createdAt.toISOString(),
      deadLetteredAt: row.failedAt?.toISOString() ?? null,
      payload: sanitizeOutboxPayload(row.payload ?? {}),
    };
  }

  private toStuckItem(row: EventOutbox): DeadLetterItemDto {
    return {
      id: row.id,
      eventType: row.type,
      status: 'stuck_retry',
      failureReason: 'stuck',
      attemptCount: row.retryCount,
      maxAttempts: OUTBOX_MAX_ATTEMPTS,
      lastError: row.lastError ? sanitizeErrorMessage(row.lastError) : null,
      requestId: extractTraceRequestId(row.payload) ?? null,
      traceSource: extractTraceSource(row.payload) ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.createdAt.toISOString(),
      deadLetteredAt: null,
      payload: sanitizeOutboxPayload(row.payload ?? {}),
    };
  }
}
