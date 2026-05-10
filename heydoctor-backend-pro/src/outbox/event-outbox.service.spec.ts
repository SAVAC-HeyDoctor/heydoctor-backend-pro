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
  function createService(row: EventOutbox) {
    const claimedRow = {
      id: row.id,
      type: row.type,
      payload: row.payload,
      processed: false,
      idempotency_key: row.idempotencyKey ?? null,
      retry_count: row.retryCount,
      last_error: row.lastError,
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
      query: jest
        .fn()
        .mockResolvedValueOnce([claimedRow])
        .mockResolvedValueOnce([claimedRow]),
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
      appendWithManager: jest.fn().mockResolvedValue({ id: 'event-row-1' }),
    };
    const subscriptionAlerts = {
      notifyPaymentFailed: jest.fn(),
    };

    const service = new EventOutboxService(
      repo as never,
      dataSource as never,
      auditService as never,
      productEvents as unknown as ProductEventsService,
      subscriptionsService as never,
      subscriptionEventsService as never,
      subscriptionAlerts as unknown as SubscriptionAlertsService,
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
    const row = {
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
      processed: false,
      processedAt: null,
      retryCount: 0,
      lastError: null,
    } as EventOutbox;
    const { service, manager, productEvents } = createService(row);

    await service.processOne(row);

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
    const row = {
      id: 'event-2',
      type: EventOutboxType.PAYMENT_SUCCEEDED,
      payload: {
        userId: 123,
      },
      processed: false,
      processedAt: null,
      retryCount: 0,
      lastError: null,
    } as EventOutbox;
    const { service, manager } = createService(row);
    manager.query.mockReset();
    manager.query
      .mockResolvedValueOnce([
        {
          id: row.id,
          type: row.type,
          payload: row.payload,
          processed: false,
          idempotency_key: null,
          retry_count: 0,
          last_error: null,
          processed_at: null,
          created_at: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);

    await service.processOne(row);

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('retry_count = retry_count + 1'),
      ['event-2', 'Invalid payment_succeeded outbox payload'],
    );
  });

  it('dispatches payment failure alerts through the outbox worker', async () => {
    const row = {
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
      processed: false,
      processedAt: null,
      retryCount: 0,
      lastError: null,
    } as EventOutbox;
    const { service, subscriptionAlerts } = createService(row);

    await service.processOne(row);

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
