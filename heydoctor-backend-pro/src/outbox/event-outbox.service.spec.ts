import { GrowthFunnelEvents } from '../growth/growth-event-names';
import type { ProductEventsService } from '../growth/product-events.service';
import type { SubscriptionAlertsService } from '../subscriptions/subscription-alerts.service';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';
import { EventOutbox, EventOutboxType } from './event-outbox.entity';
import { EventOutboxService } from './event-outbox.service';

describe('EventOutboxService', () => {
  function createRow(overrides: Partial<EventOutbox>): EventOutbox {
    return {
      id: 'event-id',
      type: EventOutboxType.PAYMENT_SUCCEEDED,
      payload: {},
      processed: false,
      idempotencyKey: null,
      retryCount: 0,
      lastError: null,
      failed: false,
      failedAt: null,
      nextAttemptAt: null,
      processedAt: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  function createService(row: EventOutbox) {
    const claimedRow = {
      id: row.id,
      type: row.type,
      payload: row.payload,
      processed: false,
      idempotency_key: row.idempotencyKey ?? null,
      retry_count: row.retryCount,
      last_error: row.lastError,
      failed: row.failed,
      failed_at: row.failedAt,
      next_attempt_at: row.nextAttemptAt,
      processed_at: row.processedAt,
      created_at: row.createdAt ?? new Date(),
    };
    const repo = {
      createQueryBuilder: jest.fn(),
      query: jest.fn().mockResolvedValue([claimedRow]),
      create: jest.fn((value: Partial<EventOutbox>) => value as EventOutbox),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = {
      query: jest.fn((sql: string) => {
        if (sql.includes('SELECT *') && sql.includes('FROM event_outbox')) {
          return Promise.resolve([claimedRow]);
        }
        if (
          sql.includes('UPDATE event_outbox') &&
          sql.includes('SET processed = true')
        ) {
          return Promise.resolve([claimedRow]);
        }
        return Promise.resolve([]);
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (work: (manager: unknown) => Promise<void>) =>
        work(manager),
      ),
    };
    const auditService = {
      logSuccess: jest.fn().mockResolvedValue(undefined),
    };
    const productEvents = {
      track: jest.fn().mockResolvedValue(undefined),
    };
    const subscriptionsService = {
      findExistingByUserIdWithManager: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.ACTIVE,
        }),
      updatePlanWithManager: jest.fn().mockResolvedValue({
        id: 'subscription-1',
        plan: SubscriptionPlan.PRO,
        clinicId: 'clinic-1',
      }),
    };
    const subscriptionEventsService = {
      appendOnceWithManager: jest.fn().mockResolvedValue({ id: 'event-row-1' }),
    };
    const subscriptionAlerts = {
      notifyPaymentFailed: jest.fn(),
    };
    const asyncMetrics = {
      recordEnqueued: jest.fn(),
      recordRetryAttempt: jest.fn(),
      recordProcessed: jest.fn(),
      recordFailedRetry: jest.fn(),
      recordDeadLetter: jest.fn(),
    };

    const service = new EventOutboxService(
      repo as never,
      dataSource as never,
      auditService as never,
      productEvents as unknown as ProductEventsService,
      subscriptionsService as never,
      subscriptionEventsService as never,
      subscriptionAlerts as unknown as SubscriptionAlertsService,
      asyncMetrics as never,
    );

    return {
      service,
      repo,
      manager,
      dataSource,
      productEvents,
      subscriptionsService,
      subscriptionEventsService,
      subscriptionAlerts,
    };
  }

  it('marks a payment success event processed after dispatch', async () => {
    const row = createRow({
      id: 'event-1',
      type: EventOutboxType.PAYMENT_SUCCEEDED,
      payload: {
        userId: 'user-1',
        clinicId: 'clinic-1',
        paymentId: 'payment-1',
        consultationId: null,
        amount: 15000,
        transactionId: 'tx-1',
        incomingPaymentStatus: 'paid',
      },
    });
    const {
      service,
      manager,
      productEvents,
      subscriptionEventsService,
      subscriptionsService,
    } = createService(row);

    await service.processOne(row);

    expect(
      subscriptionEventsService.appendOnceWithManager,
    ).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        userId: 'user-1',
        clinicId: 'clinic-1',
        eventType: 'WEBHOOK_RECEIVED',
        metadata: expect.objectContaining({
          paymentId: 'payment-1',
          incomingPaymentStatus: 'paid',
        }),
      }),
    );
    expect(subscriptionsService.updatePlanWithManager).toHaveBeenCalledWith(
      manager,
      'user-1',
      SubscriptionPlan.PRO,
      expect.objectContaining({ sub: 'system-payku-webhook' }),
      'webhook',
      'payku payment',
    );
    expect(
      subscriptionEventsService.appendOnceWithManager,
    ).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        userId: 'user-1',
        clinicId: 'clinic-1',
        eventType: 'PAYMENT_SUCCEEDED',
        metadata: expect.objectContaining({
          paymentId: 'payment-1',
          consultationId: null,
          amount: 15000,
          transactionId: 'tx-1',
        }),
      }),
    );
    expect(productEvents.track).toHaveBeenCalledWith(
      'user-1',
      GrowthFunnelEvents.PAYMENT_SUCCESS,
      expect.objectContaining({ paymentId: 'payment-1' }),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE SKIP LOCKED'),
      ['event-1', 5],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('SET processed = true'),
      ['event-1'],
    );
  });

  it('keeps failed events unprocessed and increments attempts for retry', async () => {
    const row = createRow({
      id: 'event-2',
      type: EventOutboxType.PAYMENT_SUCCEEDED,
      payload: {
        userId: 123,
      },
    });
    const { service, manager } = createService(row);
    manager.query.mockReset();
    manager.query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT *') && sql.includes('FROM event_outbox')) {
        return Promise.resolve([
          {
            id: row.id,
            type: row.type,
            payload: row.payload,
            processed: false,
            idempotency_key: null,
            retry_count: 0,
            last_error: null,
            failed: false,
            failed_at: null,
            next_attempt_at: null,
            processed_at: null,
            created_at: new Date(),
          },
        ]);
      }
      return Promise.resolve([]);
    });

    await service.processOne(row);

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('retry_count = retry_count + 1'),
      ['event-2', 'Invalid payment_succeeded outbox payload', 5, 1000],
    );
  });

  it('dispatches payment failure alerts through the outbox worker', async () => {
    const row = createRow({
      id: 'event-3',
      type: EventOutboxType.PAYMENT_FAILED,
      payload: {
        userId: 'user-1',
        clinicId: 'clinic-1',
        paymentId: 'payment-1',
        consultationId: null,
        amount: 15000,
        transactionId: null,
        incomingPaymentStatus: 'failed',
      },
    });
    const { service, manager, subscriptionAlerts, subscriptionEventsService } =
      createService(row);

    await service.processOne(row);

    expect(
      subscriptionEventsService.appendOnceWithManager,
    ).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        userId: 'user-1',
        clinicId: 'clinic-1',
        eventType: 'WEBHOOK_RECEIVED',
        metadata: expect.objectContaining({
          paymentId: 'payment-1',
          incomingPaymentStatus: 'failed',
        }),
      }),
    );
    expect(
      subscriptionEventsService.appendOnceWithManager,
    ).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        userId: 'user-1',
        clinicId: 'clinic-1',
        eventType: 'PAYMENT_FAILED',
        metadata: expect.objectContaining({
          event: 'payku_payment_failed',
          paymentId: 'payment-1',
          consultationId: null,
          clinicId: 'clinic-1',
        }),
      }),
    );
    expect(subscriptionAlerts.notifyPaymentFailed).toHaveBeenCalledWith({
      userId: 'user-1',
      clinicId: 'clinic-1',
      metadata: {
        event: 'payku_payment_failed',
        paymentId: 'payment-1',
        consultationId: null,
        clinicId: 'clinic-1',
      },
    });
  });
});
