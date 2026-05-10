import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, MoreThan, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { lockSignedConsultationAfterPaymentWithManager } from '../consultations/consultations.service';
import { GrowthFunnelEvents } from '../growth/growth-event-names';
import { ProductEventsService } from '../growth/product-events.service';
import { FinancialLedgerType } from '../payku/financial-ledger.entity';
import {
  SubscriptionChangeSource,
  SubscriptionPlan,
} from '../subscriptions/subscription.entity';
import { SubscriptionAlertsService } from '../subscriptions/subscription-alerts.service';
import {
  SubscriptionEventSource,
  SubscriptionEventType,
} from '../subscriptions/subscription-event.entity';
import { SubscriptionEventsService } from '../subscriptions/subscription-events.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UserRole } from '../users/user-role.enum';
import { EventOutbox, EventOutboxType } from './event-outbox.entity';

type PaymentStatusUpdatedPayload = {
  userId: string;
  clinicId: string;
  paymentId: string;
  consultationId: string | null;
  amount: number;
  transactionId: string | null;
  incomingPaymentStatus: string;
};

type PaymentSucceededPayload = {
  userId: string;
  clinicId: string;
  paymentId: string;
  consultationId: string | null;
  amount: number;
  transactionId: string | null;
  incomingPaymentStatus: string;
};

type PaymentFailedPayload = {
  userId: string;
  clinicId: string;
  paymentId: string;
  consultationId: string | null;
  amount: number;
  transactionId: string | null;
  incomingPaymentStatus: string;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown outbox processing error';
  }
}

function isPaymentStatusUpdatedPayload(
  payload: Record<string, unknown>,
): payload is PaymentStatusUpdatedPayload {
  return (
    typeof payload.userId === 'string' &&
    typeof payload.clinicId === 'string' &&
    typeof payload.paymentId === 'string' &&
    (typeof payload.consultationId === 'string' ||
      payload.consultationId === null) &&
    typeof payload.amount === 'number' &&
    (typeof payload.transactionId === 'string' ||
      payload.transactionId === null) &&
    typeof payload.incomingPaymentStatus === 'string'
  );
}

function isPaymentSucceededPayload(
  payload: Record<string, unknown>,
): payload is PaymentSucceededPayload {
  return (
    typeof payload.userId === 'string' &&
    typeof payload.clinicId === 'string' &&
    typeof payload.paymentId === 'string' &&
    (typeof payload.consultationId === 'string' ||
      payload.consultationId === null) &&
    typeof payload.amount === 'number' &&
    (typeof payload.transactionId === 'string' ||
      payload.transactionId === null) &&
    typeof payload.incomingPaymentStatus === 'string'
  );
}

function isPaymentFailedPayload(
  payload: Record<string, unknown>,
): payload is PaymentFailedPayload {
  return (
    typeof payload.userId === 'string' &&
    typeof payload.clinicId === 'string' &&
    typeof payload.paymentId === 'string' &&
    (typeof payload.consultationId === 'string' ||
      payload.consultationId === null) &&
    typeof payload.amount === 'number' &&
    (typeof payload.transactionId === 'string' ||
      payload.transactionId === null) &&
    typeof payload.incomingPaymentStatus === 'string'
  );
}

type ClaimedOutboxRow = {
  id: string;
  type: EventOutboxType;
  payload: Record<string, unknown>;
  processed: boolean;
  idempotency_key: string | null;
  retry_count: number;
  last_error: string | null;
  failed: boolean;
  failed_at: Date | string | null;
  next_attempt_at: Date | string | null;
  processed_at: Date | string | null;
  created_at: Date | string;
};

type EnqueueOutboxEvent = {
  type: EventOutboxType;
  payload: Record<string, unknown>;
  idempotencyKey?: string | null;
};

const OUTBOX_POLL_INTERVAL_MS = 5_000;
const OUTBOX_BATCH_SIZE = 25;
const OUTBOX_MAX_ATTEMPTS = 5;

const SYSTEM_USER: AuthenticatedUser = {
  sub: 'system-payku-webhook',
  email: 'system@heydoctor.internal',
  role: UserRole.ADMIN,
  clinicId: null,
};

@Injectable()
export class EventOutboxService {
  private readonly logger = new Logger(EventOutboxService.name);
  private processing = false;

  constructor(
    @InjectRepository(EventOutbox)
    private readonly repo: Repository<EventOutbox>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly productEvents: ProductEventsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly subscriptionEventsService: SubscriptionEventsService,
    private readonly subscriptionAlerts: SubscriptionAlertsService,
  ) {}

  @Interval(OUTBOX_POLL_INTERVAL_MS)
  async processPending(): Promise<void> {
    if (this.processing) {
      this.logger.log('event_outbox_poll_skipped_in_progress');
      return;
    }

    this.processing = true;
    try {
      await this.processBatch();
      await this.logMetrics();
    } catch (err) {
      this.logger.error(
        'event_outbox_poll_failed',
        err instanceof Error ? err : new Error(errorMessage(err)),
      );
    } finally {
      this.processing = false;
    }
  }

  async enqueue(event: EnqueueOutboxEvent): Promise<EventOutbox | null> {
    const rows = await this.repo.query<ClaimedOutboxRow[]>(
      `
        INSERT INTO event_outbox (type, idempotency_key, payload)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT DO NOTHING
        RETURNING *
      `,
      [event.type, event.idempotencyKey ?? null, JSON.stringify(event.payload)],
    );

    if (rows[0]) {
      return this.toEntity(rows[0]);
    }

    if (!event.idempotencyKey) {
      return null;
    }

    return this.repo.findOne({
      where: { idempotencyKey: event.idempotencyKey },
    });
  }

  async processBatch(): Promise<number> {
    const rows = await this.dataSource.transaction(async (manager) => {
      return manager.query<ClaimedOutboxRow[]>(
        `
          SELECT *
          FROM event_outbox
          WHERE processed = false
            AND failed = false
            AND retry_count < $1
            AND (next_attempt_at IS NULL OR next_attempt_at <= now())
          ORDER BY created_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        `,
        [OUTBOX_MAX_ATTEMPTS, OUTBOX_BATCH_SIZE],
      );
    });

    if (rows.length > 0) {
      this.logger.log('event_outbox_poll_batch', {
        count: rows.length,
      });
    }

    for (const row of rows) {
      await this.processEvent(this.toEntity(row));
    }

    return rows.length;
  }

  private async logMetrics(): Promise<void> {
    const [pending, processed, failed] = await Promise.all([
      this.repo.count({ where: { processed: false } }),
      this.repo.count({ where: { processed: true } }),
      this.repo.count({
        where: {
          processed: false,
          failed: false,
          retryCount: MoreThan(0),
        },
      }),
    ]);

    this.logger.log('event_outbox_metrics', {
      pending,
      processed,
      failed,
    });
  }

  async processOne(row: EventOutbox): Promise<void> {
    return this.processEvent(row);
  }

  async processEvent(row: EventOutbox): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const claimedRows = await manager.query<ClaimedOutboxRow[]>(
        `
          SELECT *
          FROM event_outbox
          WHERE id = $1
            AND processed = false
            AND failed = false
            AND retry_count < $2
            AND (next_attempt_at IS NULL OR next_attempt_at <= now())
          FOR UPDATE SKIP LOCKED
        `,
        [row.id, OUTBOX_MAX_ATTEMPTS],
      );

      const claimed = claimedRows[0];
      if (!claimed) {
        this.logger.log('event_outbox_skip_already_processed_or_locked', {
          eventId: row.id,
        });
        return;
      }

      const event = this.toEntity(claimed);

      try {
        await this.dispatch(event);
        const markedRows = await manager.query<ClaimedOutboxRow[]>(
          `
            UPDATE event_outbox
            SET processed = true,
                processed_at = now(),
                last_error = NULL
            WHERE id = $1 AND processed = false
            RETURNING *
          `,
          [event.id],
        );
        if (markedRows.length === 0) {
          this.logger.log('event_outbox_mark_processed_skipped', {
            eventId: event.id,
            type: event.type,
          });
          return;
        }
        this.logger.log('event_outbox_processed', {
          eventId: event.id,
          type: event.type,
          idempotencyKey: event.idempotencyKey,
        });
      } catch (err) {
        const lastError = errorMessage(err);
        const nextRetryCount = event.retryCount + 1;
        const delayMs = 2 ** event.retryCount * 1000;
        await manager.query(
          `
            UPDATE event_outbox
            SET retry_count = retry_count + 1,
                last_error = $2,
                next_attempt_at = now() + ($4 * interval '1 millisecond'),
                failed = CASE WHEN retry_count + 1 >= $3 THEN true ELSE failed END,
                failed_at = CASE WHEN retry_count + 1 >= $3 THEN now() ELSE failed_at END
            WHERE id = $1 AND processed = false
          `,
          [event.id, lastError, OUTBOX_MAX_ATTEMPTS, delayMs],
        );
        this.logger.error(
          'event_outbox_process_failed',
          err instanceof Error ? err : new Error(lastError),
          {
            eventId: event.id,
            type: event.type,
            retryCount: nextRetryCount,
            failed: nextRetryCount >= OUTBOX_MAX_ATTEMPTS,
            idempotencyKey: event.idempotencyKey,
          },
        );
        if (nextRetryCount >= OUTBOX_MAX_ATTEMPTS) {
          this.logger.warn('event_outbox_dead_letter', {
            eventId: event.id,
            type: event.type,
            retryCount: nextRetryCount,
            lastError,
          });
        }
      }
    });
  }

  private toEntity(row: ClaimedOutboxRow): EventOutbox {
    return this.repo.create({
      id: row.id,
      type: row.type,
      payload: row.payload,
      processed: row.processed,
      idempotencyKey: row.idempotency_key,
      retryCount: Number(row.retry_count ?? 0),
      lastError: row.last_error,
      failed: row.failed,
      failedAt: row.failed_at ? new Date(row.failed_at) : null,
      nextAttemptAt: row.next_attempt_at ? new Date(row.next_attempt_at) : null,
      processedAt: row.processed_at ? new Date(row.processed_at) : null,
      createdAt: new Date(row.created_at),
    });
  }

  private async dispatch(row: EventOutbox): Promise<void> {
    switch (row.type) {
      case EventOutboxType.PAYMENT_STATUS_UPDATED:
        if (!isPaymentStatusUpdatedPayload(row.payload)) {
          throw new Error('Invalid payment_status_updated outbox payload');
        }
        await this.appendWebhookReceived(row.payload);
        return;

      case EventOutboxType.PAYMENT_SUCCEEDED:
        if (!isPaymentSucceededPayload(row.payload)) {
          throw new Error('Invalid payment_succeeded outbox payload');
        }
        await this.processPaymentSucceeded(row.payload);
        return;

      case EventOutboxType.PAYMENT_FAILED:
        if (!isPaymentFailedPayload(row.payload)) {
          throw new Error('Invalid payment_failed outbox payload');
        }
        await this.processPaymentFailed(row.payload);
        return;

      default:
        throw new Error('Unsupported outbox event type');
    }
  }

  private async appendWebhookReceived(
    payload: PaymentStatusUpdatedPayload,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.subscriptionEventsService.appendOnceWithManager(manager, {
        userId: payload.userId,
        clinicId: payload.clinicId,
        eventType: SubscriptionEventType.WEBHOOK_RECEIVED,
        source: SubscriptionEventSource.WEBHOOK,
        metadata: {
          paymentId: payload.paymentId,
          incomingPaymentStatus: payload.incomingPaymentStatus,
        },
      });
    });
  }

  private async processPaymentSucceeded(
    payload: PaymentSucceededPayload,
  ): Promise<void> {
    type DeferredAudit = () => Promise<void>;
    const audits: DeferredAudit[] = [];

    await this.dataSource.transaction(async (manager) => {
      await this.subscriptionEventsService.appendOnceWithManager(manager, {
        userId: payload.userId,
        clinicId: payload.clinicId,
        eventType: SubscriptionEventType.WEBHOOK_RECEIVED,
        source: SubscriptionEventSource.WEBHOOK,
        metadata: {
          paymentId: payload.paymentId,
          incomingPaymentStatus: payload.incomingPaymentStatus,
        },
      });

      const subBefore =
        await this.subscriptionsService.findExistingByUserIdWithManager(
          manager,
          payload.userId,
        );
      const webhookActor: AuthenticatedUser = {
        ...SYSTEM_USER,
        clinicId: payload.clinicId,
      };
      const subUpdated =
        subBefore?.plan === SubscriptionPlan.PRO
          ? subBefore
          : await this.subscriptionsService.updatePlanWithManager(
              manager,
              payload.userId,
              SubscriptionPlan.PRO,
              webhookActor,
              SubscriptionChangeSource.WEBHOOK,
              'payku payment',
            );

      if (subBefore?.plan !== subUpdated.plan) {
        audits.push(() =>
          this.auditService.logSuccess({
            action: 'SUBSCRIPTION_PLAN_CHANGED',
            resource: 'subscription',
            resourceId: subUpdated.id,
            userId: payload.userId,
            clinicId: payload.clinicId,
            httpStatus: 200,
            metadata: {
              from: subBefore?.plan ?? null,
              to: subUpdated.plan,
              changedBy: SYSTEM_USER.sub,
              source: SubscriptionChangeSource.WEBHOOK,
              type: 'plan_change',
              reason: 'payku payment',
            },
          }),
        );
      }

      const subAfter =
        await this.subscriptionsService.findExistingByUserIdWithManager(
          manager,
          payload.userId,
        );
      if (subAfter) {
        await this.subscriptionEventsService.appendOnceWithManager(manager, {
          userId: payload.userId,
          clinicId: payload.clinicId,
          eventType: SubscriptionEventType.PAYMENT_SUCCEEDED,
          previousPlan: subBefore?.plan ?? null,
          newPlan: subAfter.plan,
          previousStatus: subBefore?.status ?? null,
          newStatus: subAfter.status,
          source: SubscriptionEventSource.WEBHOOK,
          metadata: {
            paymentId: payload.paymentId,
            consultationId: payload.consultationId,
            amount: payload.amount,
            transactionId: payload.transactionId,
          },
        });
      }

      await this.appendPaymentSucceededLedgerEntry(manager, payload);

      if (payload.consultationId) {
        const consultation =
          await lockSignedConsultationAfterPaymentWithManager(
            manager,
            payload.consultationId,
          );
        if (consultation) {
          audits.push(() =>
            this.auditService.logSuccess({
              action: 'CONSULTATION_LOCKED',
              resource: 'consultation',
              resourceId: consultation.id,
              userId: payload.userId,
              clinicId: consultation.clinicId,
              httpStatus: 200,
              metadata: {
                reason: 'payment_completed',
                paymentId: payload.paymentId,
              },
            }),
          );
        }
      }
    });

    for (const audit of audits) {
      try {
        await audit();
      } catch (err) {
        this.logger.error(
          'event_outbox_deferred_audit_failed',
          err instanceof Error ? err : new Error(errorMessage(err)),
        );
      }
    }

    try {
      await this.productEvents.track(
        payload.userId,
        GrowthFunnelEvents.PAYMENT_SUCCESS,
        {
          paymentId: payload.paymentId,
          consultationId: payload.consultationId,
          amount: payload.amount,
          transactionId: payload.transactionId,
        },
      );
    } catch (err) {
      this.logger.error(
        'event_outbox_product_event_failed',
        err instanceof Error ? err : new Error(errorMessage(err)),
        {
          paymentId: payload.paymentId,
          type: EventOutboxType.PAYMENT_SUCCEEDED,
        },
      );
    }
  }

  private async processPaymentFailed(
    payload: PaymentFailedPayload,
  ): Promise<void> {
    const metadata = {
      event: 'payku_payment_failed',
      paymentId: payload.paymentId,
      consultationId: payload.consultationId,
      clinicId: payload.clinicId,
    };

    await this.dataSource.transaction(async (manager) => {
      await this.subscriptionEventsService.appendOnceWithManager(manager, {
        userId: payload.userId,
        clinicId: payload.clinicId,
        eventType: SubscriptionEventType.WEBHOOK_RECEIVED,
        source: SubscriptionEventSource.WEBHOOK,
        metadata: {
          paymentId: payload.paymentId,
          incomingPaymentStatus: payload.incomingPaymentStatus,
        },
      });

      const subSnap =
        await this.subscriptionsService.findExistingByUserIdWithManager(
          manager,
          payload.userId,
        );
      await this.subscriptionEventsService.appendOnceWithManager(manager, {
        userId: payload.userId,
        clinicId: payload.clinicId,
        eventType: SubscriptionEventType.PAYMENT_FAILED,
        previousPlan: subSnap?.plan ?? null,
        newPlan: subSnap?.plan ?? null,
        previousStatus: subSnap?.status ?? null,
        newStatus: subSnap?.status ?? null,
        source: SubscriptionEventSource.WEBHOOK,
        metadata,
      });
    });

    try {
      this.subscriptionAlerts.notifyPaymentFailed({
        userId: payload.userId,
        clinicId: payload.clinicId,
        metadata,
      });
    } catch (err) {
      this.logger.error(
        'event_outbox_payment_failed_notification_failed',
        err instanceof Error ? err : new Error(errorMessage(err)),
        {
          paymentId: payload.paymentId,
          type: EventOutboxType.PAYMENT_FAILED,
        },
      );
    }
  }

  private async appendPaymentSucceededLedgerEntry(
    manager: EntityManager,
    payload: PaymentSucceededPayload,
  ): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `financial_ledger:${payload.userId}`,
    ]);

    await manager.query(
      `
        INSERT INTO financial_ledger (
          user_id,
          type,
          amount,
          reference_id,
          balance_after
        )
        SELECT
          $1,
          $2,
          $3,
          $4,
          COALESCE((
            SELECT balance_after
            FROM financial_ledger
            WHERE user_id = $1
            ORDER BY created_at DESC, id DESC
            LIMIT 1
          ), 0) + $3
        ON CONFLICT (type, reference_id) DO NOTHING
      `,
      [
        payload.userId,
        FinancialLedgerType.CREDIT,
        payload.amount,
        payload.paymentId,
      ],
    );
  }
}
