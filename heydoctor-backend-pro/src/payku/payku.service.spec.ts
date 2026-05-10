import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuditService } from '../audit/audit.service';
import type { AuthorizationService } from '../authorization/authorization.service';
import { Consultation } from '../consultations/consultation.entity';
import type { ProductEventsService } from '../growth/product-events.service';
import { EventOutboxType } from '../outbox/event-outbox.entity';
import { PaykuPayment, PaykuPaymentStatus } from './payku-payment.entity';
import { PaykuService } from './payku.service';

type WebhookProcessor = {
  processWebhookInTransaction(
    paymentId: string,
    incomingStatus: PaykuPaymentStatus,
    incomingAmount: number | null,
    rawBody: Record<string, unknown>,
  ): Promise<{ action: string; paymentId?: string }>;
};

describe('PaykuService webhook transactions', () => {
  it('only writes payment state and outbox events inside the webhook transaction', async () => {
    let inTransaction = false;

    const payment = {
      id: 'payment-1',
      userId: 'user-1',
      clinicId: 'clinic-1',
      consultationId: 'consultation-1',
      status: PaykuPaymentStatus.PENDING,
      amount: 15000,
      transactionId: null,
      rawResponse: null,
      paidAt: null,
      createdAt: new Date(),
    } as PaykuPayment;

    const paymentRepo = {
      findOne: jest.fn().mockResolvedValue(payment),
      save: jest.fn(async (row: PaykuPayment) => row),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === PaykuPayment) return paymentRepo;
        throw new Error('unexpected repository');
      }),
      query: jest.fn(async () => []),
    } as unknown as EntityManager;

    const productEvents = {
      track: jest.fn(async () => {
        expect(inTransaction).toBe(false);
      }),
    };
    const auditService = {
      logSuccess: jest.fn(async () => {
        expect(inTransaction).toBe(false);
      }),
      logError: jest.fn(async () => {
        expect(inTransaction).toBe(false);
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: EntityManager) => Promise<unknown>) => {
          inTransaction = true;
          const result = await callback(manager);
          expect(productEvents.track).not.toHaveBeenCalled();
          expect(auditService.logSuccess).not.toHaveBeenCalled();
          inTransaction = false;
          return result;
        },
      ),
    };
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          NODE_ENV: 'test',
          PAYKU_API_KEY: 'payku-key',
          PAYKU_API_URL: 'https://payku.test',
          PAYMENT_PENDING_EXPIRE_MINUTES: '1440',
        };
        return values[key];
      }),
    };
    const logger: Partial<LoggerService> = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const service = new PaykuService(
      {} as Repository<PaykuPayment>,
      {} as Repository<Consultation>,
      dataSource as unknown as DataSource,
      config as unknown as ConfigService,
      {} as AuthorizationService,
      auditService as unknown as AuditService,
      logger as LoggerService,
      productEvents as unknown as ProductEventsService,
    );

    const result = await (
      service as unknown as WebhookProcessor
    ).processWebhookInTransaction('payment-1', PaykuPaymentStatus.PAID, 15000, {
      transaction_id: 'tx-1',
    });

    expect(result).toEqual({ action: 'processed', paymentId: 'payment-1' });
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(paymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: PaykuPaymentStatus.PAID,
        transactionId: 'tx-1',
      }),
    );
    expect(productEvents.track).not.toHaveBeenCalled();
    expect(manager.getRepository).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO event_outbox'),
      [
        EventOutboxType.PAYMENT_SUCCEEDED,
        'payku:payment-1:payment_succeeded',
        expect.stringContaining('"paymentId":"payment-1"'),
      ],
    );
  });
});
