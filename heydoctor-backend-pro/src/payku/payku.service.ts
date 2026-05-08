import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type LoggerService,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { assignClinic } from '../common/entity-clinic.util';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { Consultation } from '../consultations/consultation.entity';
import { ConsultationStatus } from '../consultations/consultation-status.enum';
import { GrowthFunnelEvents } from '../growth/growth-event-names';
import { ProductEventsService } from '../growth/product-events.service';
import {
  SubscriptionChangeSource,
  SubscriptionPlan,
} from '../subscriptions/subscription.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
  SubscriptionEventSource,
  SubscriptionEventType,
} from '../subscriptions/subscription-event.entity';
import { SubscriptionEventsService } from '../subscriptions/subscription-events.service';
import { notifyAlert } from '../common/alerts/alert.hooks';
import { CircuitBreaker } from '../common/resilience/circuit-breaker';
import { retry } from '../common/resilience/retry.util';
import { SubscriptionAlertsService } from '../subscriptions/subscription-alerts.service';
import { UserRole } from '../users/user-role.enum';
import {
  PaykuPayment,
  PaykuPaymentStatus,
  isFinalStatus,
  isTransitionAllowed,
} from './payku-payment.entity';
import {
  assertPaykuWebhookAuthenticated,
  type PaykuWebhookAuthConfig,
} from './payku-webhook-auth';

const SYSTEM_USER: AuthenticatedUser = {
  sub: 'system-payku-webhook',
  email: 'system@heydoctor.internal',
  role: UserRole.ADMIN,
  clinicId: null,
};

type WebhookResult = {
  action: string;
  paymentId?: string;
  duplicate?: boolean;
  error?: string;
};

@Injectable()
export class PaykuService {
  private readonly authConfig: PaykuWebhookAuthConfig;
  private readonly pendingExpireMinutes: number;
  private readonly paykuApiKey?: string;
  private readonly paykuCircuitBreaker = new CircuitBreaker(5, 10_000);

  constructor(
    @InjectRepository(PaykuPayment)
    private readonly paymentsRepository: Repository<PaykuPayment>,
    @InjectRepository(Consultation)
    private readonly consultationsRepository: Repository<Consultation>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly authorizationService: AuthorizationService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly subscriptionEventsService: SubscriptionEventsService,
    private readonly subscriptionAlertsService: SubscriptionAlertsService,
    private readonly auditService: AuditService,
    @Inject(APP_LOGGER)
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => ProductEventsService))
    private readonly productEvents: ProductEventsService,
  ) {
    this.authConfig = {
      webhookSecret: this.config.get<string>('PAYKU_WEBHOOK_SECRET'),
      webhookBearer: this.config.get<string>('PAYKU_WEBHOOK_BEARER'),
      allowUnsafeLocal:
        this.config.get<string>('PAYKU_WEBHOOK_ALLOW_UNSAFE_LOCAL') === 'true',
      nodeEnv: this.config.get<string>('NODE_ENV') ?? 'development',
    };
    this.pendingExpireMinutes = Number(
      this.config.get<string>('PAYMENT_PENDING_EXPIRE_MINUTES') ?? '1440',
    );
    this.paykuApiKey = this.config.get<string>('PAYKU_API_KEY')?.trim();
    if (!this.paykuApiKey) {
      this.logger.warn(
        'Payku not configured: PAYKU_API_KEY is empty — live Payku API calls will use mock checkout URLs only',
      );
    }
  }

  /** Payku API externo: reintentos + circuit breaker; error si HTTP no OK. */
  private async callPaykuCreateTransaction(
    body: Record<string, unknown>,
  ): Promise<Response> {
    const paykuApiUrl = this.config.get<string>('PAYKU_API_URL');
    if (!paykuApiUrl || !this.paykuApiKey) {
      throw new Error('Payku API not configured');
    }
    return retry(
      () =>
        this.paykuCircuitBreaker.exec(async () => {
          const res = await fetch(`${paykuApiUrl}/transaction`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.paykuApiKey}`,
            },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            throw new Error(`Payku HTTP ${res.status}`);
          }
          return res;
        }),
      { retries: 3, delayMs: 300 },
    );
  }

  // ── Create Payment Session ─────────────────────────────────────

  async createPaymentSession(
    consultationId: string,
    authUser: AuthenticatedUser,
  ): Promise<{ paymentId: string; paymentUrl: string }> {
    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);

    const consultation = await this.consultationsRepository.findOne({
      where: { id: consultationId, clinicId },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }

    const allowedForPayment: ConsultationStatus[] = [
      ConsultationStatus.COMPLETED,
      ConsultationStatus.SIGNED,
    ];
    if (!allowedForPayment.includes(consultation.status)) {
      throw new BadRequestException(
        'Consultation must be completed or signed before payment',
      );
    }

    const existing = await this.paymentsRepository.findOne({
      where: {
        consultationId,
        status: PaykuPaymentStatus.PENDING,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'A pending payment already exists for this consultation',
      );
    }

    const paidExists = await this.paymentsRepository.findOne({
      where: {
        consultationId,
        status: PaykuPaymentStatus.PAID,
      },
    });
    if (paidExists) {
      throw new BadRequestException('Consultation is already paid');
    }

    const amount = Number(
      this.config.get<string>('CONSULTATION_PAYMENT_AMOUNT_CLP') ?? '15000',
    );

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'https://heydoctor.vercel.app';
    const backendUrl =
      this.config.get<string>('BACKEND_PUBLIC_URL') ??
      'https://heydoctor-backend-pro-production.up.railway.app';

    const payment = this.paymentsRepository.create({
      userId: authUser.sub,
      consultationId,
      amount,
      currency: 'CLP',
      status: PaykuPaymentStatus.PENDING,
    });
    assignClinic(payment, consultation.clinicId);
    const saved = await this.paymentsRepository.save(payment);

    /**
     * Payku live: desactivar con PAYKU_CONSULTATION_PAYMENTS_DISABLED=true (revertir quitando o false).
     * Si la API falla o falta URL, se usa URL mock y se registra el error — sin 502 ni excepción al cliente.
     */
    let paymentUrl: string | undefined;
    const paykuApiUrl = this.config.get<string>('PAYKU_API_URL');
    const paykuLiveDisabled =
      this.config.get<string>('PAYKU_CONSULTATION_PAYMENTS_DISABLED') ===
      'true';

    const mockPaymentUrl = `${frontendUrl}/panel/consultas/${consultationId}?payment=mock&paymentId=${saved.id}`;

    if (paykuLiveDisabled) {
      this.logger.warn(
        'PAYKU_CONSULTATION_PAYMENTS_DISABLED=true: skipping live Payku API (mock checkout URL)',
      );
    } else if (paykuApiUrl && this.paykuApiKey) {
      try {
        const res = await this.callPaykuCreateTransaction({
          email: authUser.email,
          order: saved.id,
          subject: `Consulta médica HeyDoctor`,
          amount,
          currency: 'CLP',
          payment_id: saved.id,
          urlreturn: `${frontendUrl}/panel/consultas/${consultationId}?payment=success`,
          urlnotify: `${backendUrl}/api/payku/webhook`,
        });
        const data = (await res.json()) as {
          url?: string;
          redirect_url?: string;
        };
        paymentUrl = data.url ?? data.redirect_url ?? '';
        if (!paymentUrl) {
          this.logger.warn(
            'Payku response missing payment URL; using mock checkout URL',
          );
        }
      } catch (err) {
        this.logger.error(
          'Payku API call failed; using mock checkout URL',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    } else {
      this.logger.warn(
        'PAYKU_API_URL/PAYKU_API_KEY not configured; returning mock payment URL',
      );
    }

    if (!paymentUrl) {
      paymentUrl = mockPaymentUrl;
    }

    this.logger.log('payku_payment_created', {
      event: 'payku_payment_created',
      paymentId: saved.id,
      consultationId,
      clinicId,
      amount,
      mockMode:
        paykuLiveDisabled ||
        !paykuApiUrl ||
        !this.paykuApiKey ||
        paymentUrl === mockPaymentUrl,
    });

    void this.auditService.logSuccess({
      userId: authUser.sub,
      action: 'PAYMENT_CREATED',
      resource: 'payment',
      resourceId: saved.id,
      clinicId,
      httpStatus: 201,
      metadata: {
        consultationId,
        amount,
      },
    });

    void this.productEvents
      .track(authUser.sub, GrowthFunnelEvents.START_CHECKOUT, {
        consultationId,
        paymentId: saved.id,
      })
      .catch(() => undefined);

    return { paymentId: saved.id, paymentUrl };
  }

  /**
   * Checkout PRO desde /pricing (sin consulta). Payku + fila `payku_payments` con `consultation_id` null.
   */
  async createPricingProCheckout(params: {
    userId: string;
    clinicId: string;
    email: string;
    amount: number;
    metadata: Record<string, unknown>;
  }): Promise<{ paymentId: string; paymentUrl: string }> {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'https://heydoctor.vercel.app';
    const backendUrl =
      this.config.get<string>('BACKEND_PUBLIC_URL') ??
      'https://heydoctor-backend-pro-production.up.railway.app';

    const payment = this.paymentsRepository.create({
      userId: params.userId,
      consultationId: null,
      amount: params.amount,
      currency: 'CLP',
      status: PaykuPaymentStatus.PENDING,
      metadata: params.metadata,
    });
    assignClinic(payment, params.clinicId);
    const saved = await this.paymentsRepository.save(payment);

    let paymentUrl: string | undefined;
    const paykuApiUrl = this.config.get<string>('PAYKU_API_URL');
    const paykuLiveDisabled =
      this.config.get<string>('PAYKU_CONSULTATION_PAYMENTS_DISABLED') ===
      'true';

    const mockPaymentUrl = `${frontendUrl}/pricing?payment=mock&paymentId=${saved.id}`;

    if (paykuLiveDisabled) {
      this.logger.warn(
        'PAYKU_CONSULTATION_PAYMENTS_DISABLED=true: skipping live Payku API (mock pricing checkout URL)',
      );
    } else if (!this.paykuApiKey) {
      this.logger.warn(
        'Payku not configured: PAYKU_API_KEY missing; using mock pricing checkout URL',
      );
    } else if (paykuApiUrl && this.paykuApiKey) {
      try {
        const res = await this.callPaykuCreateTransaction({
          email: params.email,
          order: saved.id,
          subject: 'Suscripción PRO HeyDoctor',
          amount: params.amount,
          currency: 'CLP',
          payment_id: saved.id,
          urlreturn: `${frontendUrl}/pricing?payment=success&paymentId=${saved.id}`,
          urlnotify: `${backendUrl}/api/payku/webhook`,
        });
        const data = (await res.json()) as {
          url?: string;
          redirect_url?: string;
        };
        paymentUrl = data.url ?? data.redirect_url ?? '';
        if (!paymentUrl) {
          this.logger.warn(
            'Payku response missing payment URL; using mock checkout URL',
          );
        }
      } catch (err) {
        this.logger.error(
          'Payku pricing API call failed; using mock checkout URL',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    } else {
      this.logger.warn(
        'PAYKU_API_URL not configured; returning mock pricing checkout URL',
      );
    }

    if (!paymentUrl) {
      paymentUrl = mockPaymentUrl;
    }

    this.logger.log('payku_pricing_checkout_created', {
      event: 'payku_pricing_checkout_created',
      paymentId: saved.id,
      clinicId: params.clinicId,
      amount: params.amount,
      mockMode:
        paykuLiveDisabled ||
        !paykuApiUrl ||
        !this.paykuApiKey ||
        paymentUrl === mockPaymentUrl,
    });

    void this.auditService.logSuccess({
      userId: params.userId,
      action: 'PAYMENT_CREATED',
      resource: 'payment',
      resourceId: saved.id,
      clinicId: params.clinicId,
      httpStatus: 201,
      metadata: {
        kind: 'pricing_pro',
        amount: params.amount,
        ...params.metadata,
      },
    });

    return { paymentId: saved.id, paymentUrl };
  }

  /**
   * Webhook Payku: 401 si falla autenticación; 4xx si el cuerpo o la transición no aplican;
   * 200 solo con procesamiento idempotente o actualización aplicada ({ ok: true }).
   */
  async handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: Record<string, unknown>,
    rawBody?: Buffer,
  ): Promise<{
    ok: true;
    action: string;
    paymentId?: string;
    duplicate?: boolean;
  }> {
    try {
      assertPaykuWebhookAuthenticated(headers, body, this.authConfig, rawBody);
    } catch (err) {
      const msg =
        err instanceof UnauthorizedException
          ? err.message
          : (err as Error).message;
      this.logger.warn('Payku webhook authentication failed', {
        event: 'payku_webhook_auth_failed',
        error: msg,
      });
      notifyAlert(
        {
          event: 'payku_webhook_auth_failed',
          error: msg,
        },
        {
          level: 'critical',
          key: 'payku_webhook_auth',
        },
      );
      void this.auditService.logError({
        action: 'PAYKU_WEBHOOK_AUTH_FAILED',
        resource: 'payment',
        resourceId: null,
        userId: null,
        clinicId: null,
        httpStatus: 401,
        errorMessage: msg,
        metadata: {
          ip: typeof body._ip === 'string' ? body._ip : undefined,
        },
      });
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException(msg);
    }

    this.logger.log('Payku webhook authenticated', {
      event: 'payku_webhook_authenticated',
      paymentIdHint: String(body.payment_id ?? body.paymentId ?? body.id ?? ''),
    });

    const paymentId = String(
      body.payment_id ?? body.paymentId ?? body.id ?? '',
    );
    if (!paymentId) {
      this.logger.warn('Payku webhook missing payment_id', {
        event: 'payku_webhook_missing_payment_id',
      });
      throw new BadRequestException('missing payment_id');
    }

    const incomingStatus = this.resolveStatus(body);
    if (!incomingStatus) {
      this.logger.warn('Payku webhook unknown status', {
        event: 'payku_webhook_unknown_status',
        paymentId,
      });
      throw new BadRequestException('unknown payment status');
    }

    const incomingAmount = this.extractAmount(body);

    const result = await this.processWebhookInTransaction(
      paymentId,
      incomingStatus,
      incomingAmount,
      body,
    );

    this.logger.log('Payku webhook transaction completed', {
      event: 'payku_webhook_tx_result',
      action: result.action,
      paymentId: result.paymentId,
      duplicate: result.duplicate,
    });

    switch (result.action) {
      case 'processed':
        return {
          ok: true,
          action: result.action,
          paymentId: result.paymentId,
        };
      case 'already_final':
        return {
          ok: true,
          action: result.action,
          paymentId: result.paymentId,
          duplicate: result.duplicate,
        };
      case 'payment_not_found':
        throw new NotFoundException('Payment not found');
      case 'expired_before_webhook':
        throw new ConflictException('Payment expired before webhook');
      case 'invalid_transition':
        throw new ConflictException('Invalid payment status transition');
      case 'missing_amount':
        throw new BadRequestException('Missing amount in webhook payload');
      case 'amount_mismatch':
        throw new BadRequestException('Amount mismatch');
      default:
        this.logger.warn('Payku webhook unhandled action', {
          event: 'payku_webhook_unhandled',
          action: result.action,
        });
        throw new BadRequestException('Webhook processing failed');
    }
  }

  private async processWebhookInTransaction(
    paymentId: string,
    incomingStatus: PaykuPaymentStatus,
    incomingAmount: number | null,
    rawBody: Record<string, unknown>,
  ): Promise<WebhookResult> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PaykuPayment);

      const payment = await repo.findOne({
        where: { id: paymentId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!payment) {
        this.logger.warn(`Payment ${paymentId} not found`);
        void this.auditService.logError({
          action: 'PAYKU_WEBHOOK_PAYMENT_NOT_FOUND',
          resource: 'payment',
          resourceId: paymentId,
          userId: null,
          clinicId: null,
          httpStatus: 200,
          errorMessage: 'Payment not found',
        });
        return { action: 'payment_not_found', paymentId };
      }

      try {
        await this.subscriptionEventsService.append({
          userId: payment.userId,
          clinicId: payment.clinicId,
          eventType: SubscriptionEventType.WEBHOOK_RECEIVED,
          source: SubscriptionEventSource.WEBHOOK,
          metadata: {
            paymentId,
            incomingPaymentStatus: incomingStatus,
          },
        });
      } catch (err) {
        this.logger.error(
          'subscription_event_WEBHOOK_RECEIVED_failed',
          err instanceof Error ? err : new Error(String(err)),
        );
      }

      const statusBefore = payment.status;

      if (isFinalStatus(payment.status)) {
        const isDuplicate = payment.status === incomingStatus;
        void this.auditService.logSuccess({
          action: 'PAYMENT_STATUS_UPDATED',
          resource: 'payment',
          resourceId: paymentId,
          userId: payment.userId,
          clinicId: payment.clinicId,
          httpStatus: 200,
          metadata: {
            statusBefore,
            statusAfter: payment.status,
            duplicate: true,
            reason: isDuplicate
              ? 'duplicate_webhook'
              : 'final_status_unchanged',
            transactionId: payment.transactionId,
          },
        });
        return { action: 'already_final', paymentId, duplicate: true };
      }

      this.expireIfStale(payment);

      if (isFinalStatus(payment.status) && payment.status !== incomingStatus) {
        void this.auditService.logSuccess({
          action: 'PAYMENT_STATUS_UPDATED',
          resource: 'payment',
          resourceId: paymentId,
          userId: payment.userId,
          clinicId: payment.clinicId,
          httpStatus: 200,
          metadata: {
            statusBefore,
            statusAfter: payment.status,
            reason: 'expired_before_webhook',
            transactionId: payment.transactionId,
          },
        });
        return { action: 'expired_before_webhook', paymentId };
      }

      if (!isTransitionAllowed(payment.status, incomingStatus)) {
        this.logger.warn(
          `Invalid transition ${payment.status} → ${incomingStatus} for ${paymentId}`,
        );
        void this.auditService.logError({
          action: 'PAYMENT_STATUS_UPDATED',
          resource: 'payment',
          resourceId: paymentId,
          userId: payment.userId,
          clinicId: payment.clinicId,
          httpStatus: 200,
          errorMessage: `Invalid transition: ${payment.status} → ${incomingStatus}`,
        });
        return { action: 'invalid_transition', paymentId };
      }

      if (incomingStatus === PaykuPaymentStatus.PAID) {
        if (incomingAmount == null) {
          this.logger.warn(`Missing amount in paid webhook for ${paymentId}`);
          void this.auditService.logError({
            action: 'PAYMENT_STATUS_UPDATED',
            resource: 'payment',
            resourceId: paymentId,
            userId: payment.userId,
            clinicId: payment.clinicId,
            httpStatus: 200,
            errorMessage: 'Missing amount in webhook payload',
          });
          return { action: 'missing_amount', paymentId };
        }

        if (incomingAmount !== payment.amount) {
          this.logger.warn(
            `Amount mismatch for ${paymentId}: expected ${payment.amount}, got ${incomingAmount}`,
          );
          void this.auditService.logError({
            action: 'PAYMENT_STATUS_UPDATED',
            resource: 'payment',
            resourceId: paymentId,
            userId: payment.userId,
            clinicId: payment.clinicId,
            httpStatus: 200,
            errorMessage: `Amount mismatch: expected ${payment.amount}, got ${incomingAmount}`,
            metadata: {
              expectedAmount: payment.amount,
              receivedAmount: incomingAmount,
            },
          });
          return { action: 'amount_mismatch', paymentId };
        }
      }

      payment.status = incomingStatus;
      payment.rawResponse = rawBody;

      if (incomingStatus === PaykuPaymentStatus.PAID) {
        payment.transactionId = String(
          rawBody.transaction_id ?? rawBody.transactionId ?? null,
        );
        payment.paidAt = new Date();
      }

      await repo.save(payment);

      void this.auditService.logSuccess({
        action: 'PAYMENT_STATUS_UPDATED',
        resource: 'payment',
        resourceId: paymentId,
        userId: payment.userId,
        clinicId: payment.clinicId,
        httpStatus: 200,
        metadata: {
          amount: payment.amount,
          statusBefore,
          statusAfter: incomingStatus,
          transactionId: payment.transactionId,
          duplicate: false,
          reason: 'webhook_processed',
        },
      });

      if (incomingStatus === PaykuPaymentStatus.PAID) {
        void this.productEvents
          .track(payment.userId, GrowthFunnelEvents.PAYMENT_SUCCESS, {
            paymentId,
            consultationId: payment.consultationId,
            amount: payment.amount,
            transactionId: payment.transactionId ?? null,
          })
          .catch(() => undefined);

        this.logger.log('payku_payment_confirmed', {
          event: 'payku_payment_confirmed',
          paymentId,
          consultationId: payment.consultationId,
          clinicId: payment.clinicId,
          amount: payment.amount,
        });
        void this.auditService.logSuccess({
          action: 'PAYMENT_CONFIRMED',
          resource: 'payment',
          resourceId: paymentId,
          userId: payment.userId,
          clinicId: payment.clinicId,
          httpStatus: 200,
          metadata: {
            consultationId: payment.consultationId,
            amount: payment.amount,
            transactionId: payment.transactionId,
          },
        });

        const subBefore = await this.subscriptionsService.findExistingByUserId(
          payment.userId,
        );
        try {
          const webhookActor: AuthenticatedUser = {
            ...SYSTEM_USER,
            clinicId: payment.clinicId,
          };
          await this.subscriptionsService.updatePlan(
            payment.userId,
            SubscriptionPlan.PRO,
            webhookActor,
            SubscriptionChangeSource.WEBHOOK,
            'payku payment',
          );
          const subAfter = await this.subscriptionsService.findExistingByUserId(
            payment.userId,
          );
          if (subAfter) {
            try {
              await this.subscriptionEventsService.append({
                userId: payment.userId,
                clinicId: payment.clinicId,
                eventType: SubscriptionEventType.PAYMENT_SUCCEEDED,
                previousPlan: subBefore?.plan ?? null,
                newPlan: subAfter.plan,
                previousStatus: subBefore?.status ?? null,
                newStatus: subAfter.status,
                source: SubscriptionEventSource.WEBHOOK,
                metadata: {
                  paymentId,
                  consultationId: payment.consultationId,
                  amount: payment.amount,
                  transactionId: payment.transactionId,
                },
              });
            } catch (eventErr) {
              this.logger.error(
                'subscription_event_PAYMENT_SUCCEEDED_failed',
                eventErr instanceof Error
                  ? eventErr
                  : new Error(String(eventErr)),
              );
            }
          }
        } catch (err) {
          this.logger.error(
            `Failed to upgrade user ${payment.userId} after payment ${paymentId}`,
            err instanceof Error ? err : new Error(String(err)),
          );
        }

        if (payment.consultationId) {
          try {
            const consultation = await this.consultationsRepository.findOne({
              where: { id: payment.consultationId },
            });
            if (
              consultation &&
              consultation.status === ConsultationStatus.SIGNED
            ) {
              consultation.status = ConsultationStatus.LOCKED;
              await this.consultationsRepository.save(consultation);
              void this.auditService.logSuccess({
                action: 'CONSULTATION_LOCKED',
                resource: 'consultation',
                resourceId: consultation.id,
                userId: payment.userId,
                clinicId: consultation.clinicId,
                httpStatus: 200,
                metadata: {
                  reason: 'payment_completed',
                  paymentId: payment.id,
                },
              });
            }
          } catch (err) {
            this.logger.error(
              `Failed to lock consultation ${payment.consultationId} after payment`,
              err instanceof Error ? err : new Error(String(err)),
            );
          }
        }
      }

      if (incomingStatus === PaykuPaymentStatus.FAILED) {
        const meta = {
          event: 'payku_payment_failed',
          paymentId,
          consultationId: payment.consultationId,
          clinicId: payment.clinicId,
        };
        this.logger.error(
          'payku_payment_failed',
          new Error('Payku payment failed'),
          meta,
        );
        this.subscriptionAlertsService.notifyPaymentFailed({
          userId: payment.userId,
          clinicId: payment.clinicId,
          metadata: meta,
        });
        const subSnap = await this.subscriptionsService.findExistingByUserId(
          payment.userId,
        );
        try {
          await this.subscriptionEventsService.append({
            userId: payment.userId,
            clinicId: payment.clinicId,
            eventType: SubscriptionEventType.PAYMENT_FAILED,
            previousPlan: subSnap?.plan ?? null,
            newPlan: subSnap?.plan ?? null,
            previousStatus: subSnap?.status ?? null,
            newStatus: subSnap?.status ?? null,
            source: SubscriptionEventSource.WEBHOOK,
            metadata: meta,
          });
        } catch (err) {
          this.logger.error(
            'subscription_event_PAYMENT_FAILED_failed',
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }

      return { action: 'processed', paymentId };
    });
  }

  /**
   * Marca pagos `pending` vencidos como `expired` (misma regla que en webhook).
   * No llama a Payku (solo reconciliación local); desactivar con PAYKU_RECONCILIATION_DISABLED=true.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcileStalePendingPayments(): Promise<void> {
    if (this.config.get<string>('PAYKU_RECONCILIATION_DISABLED') === 'true') {
      return;
    }

    const pending = await this.paymentsRepository.find({
      where: { status: PaykuPaymentStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: 500,
    });

    let expired = 0;
    for (const p of pending) {
      const before = p.status;
      this.expireIfStale(p);
      if (p.status !== before) {
        await this.paymentsRepository.save(p);
        expired += 1;
      }
    }

    if (expired > 0) {
      this.logger.log('payku_reconciliation_expired', {
        event: 'payku_reconciliation_expired',
        count: expired,
      });
    }
  }

  private expireIfStale(payment: PaykuPayment): void {
    if (payment.status !== PaykuPaymentStatus.PENDING) return;

    const ageMs = Date.now() - payment.createdAt.getTime();
    const limitMs = this.pendingExpireMinutes * 60_000;

    if (ageMs > limitMs) {
      payment.status = PaykuPaymentStatus.EXPIRED;
      this.logger.log(
        `Payment ${payment.id} auto-expired (age: ${Math.round(ageMs / 60_000)}min)`,
      );
    }
  }

  private resolveStatus(
    body: Record<string, unknown>,
  ): PaykuPaymentStatus | null {
    const raw = String(
      body.status ?? body.payment_status ?? body.estado ?? '',
    ).toLowerCase();

    switch (raw) {
      case 'paid':
      case 'success':
      case 'approved':
      case 'pagado':
        return PaykuPaymentStatus.PAID;
      case 'failed':
      case 'rejected':
      case 'rechazado':
        return PaykuPaymentStatus.FAILED;
      case 'cancelled':
      case 'canceled':
      case 'cancelado':
        return PaykuPaymentStatus.CANCELLED;
      case 'expired':
      case 'expirado':
        return PaykuPaymentStatus.EXPIRED;
      case 'pending':
      case 'pendiente':
        return PaykuPaymentStatus.PENDING;
      default:
        return null;
    }
  }

  private extractAmount(body: Record<string, unknown>): number | null {
    const raw = body.amount ?? body.monto ?? body.total;
    if (raw == null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
}
