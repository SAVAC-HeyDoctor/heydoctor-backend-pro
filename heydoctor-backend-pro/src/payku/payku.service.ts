import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  type LoggerService,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { assignClinic } from '../common/entity-clinic.util';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { Consultation } from '../consultations/consultation.entity';
import { ConsultationStatus } from '../consultations/consultation-status.enum';
import { GrowthFunnelEvents } from '../growth/growth-event-names';
import { ProductEventsService } from '../growth/product-events.service';
import { EventOutboxType } from '../outbox/event-outbox.entity';
import { createSpan } from '../common/tracing/span';
import { notifyAlert } from '../common/alerts/alert.hooks';
import { CircuitBreaker } from '../common/resilience/circuit-breaker';
import { retry } from '../common/resilience/retry.util';
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

type WebhookResult = {
  action: string;
  paymentId?: string;
  duplicate?: boolean;
  error?: string;
};

type PostCommitAction = () => Promise<void> | void;
type FraudCheckResult = {
  fraudFlag: boolean;
  riskScore: number;
  fraudReason: string | null;
};

type FraudResponseActions = {
  critical: boolean;
  highRisk: boolean;
  rateLimitFlag: boolean;
};

type CountRow = {
  count: number;
};

type UserCreatedAtRow = {
  created_at: Date;
};

/** Nunca indefinido: `process.env.PAYKU_API_KEY ?? 'test'` (mock si falta URL o falla HTTP). */
function resolvePaykuApiKey(fromConfig?: string): string {
  const t = typeof fromConfig === 'string' ? fromConfig.trim() : '';
  if (t) return t;
  const paykuKey = process.env.PAYKU_API_KEY ?? 'test';
  const fb = typeof paykuKey === 'string' ? paykuKey.trim() : '';
  return fb.length > 0 ? fb : 'test';
}

function scalarToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function unknownToError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error('Unknown error');
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function fraudResponseActions(riskScore: number): FraudResponseActions {
  return {
    critical: riskScore >= 70,
    highRisk: riskScore >= 80,
    rateLimitFlag: riskScore >= 90,
  };
}

function withFraudActionMetadata(
  metadata: Record<string, unknown> | null | undefined,
  fraud: FraudCheckResult,
): Record<string, unknown> {
  const actions = fraudResponseActions(fraud.riskScore);
  return {
    ...(metadata ?? {}),
    fraudRiskScore: fraud.riskScore,
    fraudHighRisk: actions.highRisk,
    fraudRateLimitFlag: actions.rateLimitFlag,
  };
}

@Injectable()
export class PaykuService {
  private readonly authConfig: PaykuWebhookAuthConfig;
  private readonly pendingExpireMinutes: number;
  private readonly paykuApiKey: string;
  private readonly paykuCircuitBreaker = new CircuitBreaker(5, 10_000);

  constructor(
    @InjectRepository(PaykuPayment)
    private readonly paymentsRepository: Repository<PaykuPayment>,
    @InjectRepository(Consultation)
    private readonly consultationsRepository: Repository<Consultation>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly authorizationService: AuthorizationService,
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
    this.paykuApiKey = resolvePaykuApiKey(
      this.config.get<string>('PAYKU_API_KEY'),
    );
    const isProd = this.isProduction();
    const paykuApiUrl = this.config.get<string>('PAYKU_API_URL')?.trim();

    if (isProd && (this.paykuApiKey === 'test' || !paykuApiUrl)) {
      this.logger.error('Invalid Payku config', {
        nodeEnv: process.env.NODE_ENV,
        hasUrl: Boolean(paykuApiUrl),
        hasKey: Boolean(process.env.PAYKU_API_KEY),
      });
      throw new Error('Payku payment provider not configured in production');
    }
  }

  private isProduction(): boolean {
    return (
      (this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV) ===
      'production'
    );
  }

  private failClosedPaymentProvider(message: string, error?: unknown): never {
    if (error !== undefined) {
      this.logger.error(message, unknownToError(error));
    } else {
      this.logger.error(message);
    }
    throw new InternalServerErrorException(message);
  }

  private async runPostCommitActions(
    actions: PostCommitAction[],
  ): Promise<void> {
    for (const action of actions) {
      try {
        await action();
      } catch (err) {
        this.logger.error(
          'payku_post_commit_action_failed',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
  }

  /** Payku API externo: reintentos + circuit breaker; error si HTTP no OK. */
  private async callPaykuCreateTransaction(
    body: Record<string, unknown>,
  ): Promise<Response> {
    const span = createSpan('payku_create_transaction');
    try {
      const paykuApiUrl = this.config.get<string>('PAYKU_API_URL');
      if (!paykuApiUrl) {
        throw new Error('Payku API not configured');
      }
      return await retry(
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
    } finally {
      span.end();
    }
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
    const paykuApiUrl = this.config.get<string>('PAYKU_API_URL')?.trim();
    const paykuLiveDisabled =
      this.config.get<string>('PAYKU_CONSULTATION_PAYMENTS_DISABLED') ===
      'true';
    const isProd = this.isProduction();

    if (isProd && (paykuLiveDisabled || !paykuApiUrl)) {
      this.failClosedPaymentProvider('Payment provider not configured');
    }

    const payment = this.paymentsRepository.create({
      userId: authUser.sub,
      consultationId,
      amount,
      currency: 'CLP',
      status: PaykuPaymentStatus.PENDING,
    });
    assignClinic(payment, consultation.clinicId);
    const saved = await this.paymentsRepository.save(payment);
    await this.applyFraudSignals(saved);

    let paymentUrl: string | undefined;
    const mockPaymentUrl = `${frontendUrl}/panel/consultas/${consultationId}?payment=mock&paymentId=${saved.id}`;

    if (paykuLiveDisabled) {
      this.logger.warn(
        'PAYKU_CONSULTATION_PAYMENTS_DISABLED=true: skipping live Payku API (mock checkout URL)',
      );
    } else if (paykuApiUrl) {
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
          if (isProd) {
            this.failClosedPaymentProvider(
              'Payment provider response did not include a checkout URL',
            );
          }
          this.logger.warn(
            'Payku response missing payment URL; using mock checkout URL',
          );
        }
      } catch (err) {
        if (isProd) {
          this.failClosedPaymentProvider('Payment provider unavailable', err);
        }
        this.logger.error(
          'Payku API call failed; using mock checkout URL',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    } else {
      if (isProd) {
        this.failClosedPaymentProvider('Payment provider not configured');
      }
      this.logger.warn(
        'PAYKU_API_URL not configured; returning mock payment URL',
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
        paykuLiveDisabled || !paykuApiUrl || paymentUrl === mockPaymentUrl,
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
    const paykuApiUrl = this.config.get<string>('PAYKU_API_URL')?.trim();
    const paykuLiveDisabled =
      this.config.get<string>('PAYKU_CONSULTATION_PAYMENTS_DISABLED') ===
      'true';
    const isProd = this.isProduction();

    if (isProd && (paykuLiveDisabled || !paykuApiUrl)) {
      this.failClosedPaymentProvider('Payment provider not configured');
    }

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
    await this.applyFraudSignals(saved);

    let paymentUrl: string | undefined;
    const mockPaymentUrl = `${frontendUrl}/pricing?payment=mock&paymentId=${saved.id}`;

    if (paykuLiveDisabled) {
      this.logger.warn(
        'PAYKU_CONSULTATION_PAYMENTS_DISABLED=true: skipping live Payku API (mock pricing checkout URL)',
      );
    } else if (paykuApiUrl) {
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
          if (isProd) {
            this.failClosedPaymentProvider(
              'Payment provider response did not include a checkout URL',
            );
          }
          this.logger.warn(
            'Payku response missing payment URL; using mock checkout URL',
          );
        }
      } catch (err) {
        if (isProd) {
          this.failClosedPaymentProvider('Payment provider unavailable', err);
        }
        this.logger.error(
          'Payku pricing API call failed; using mock checkout URL',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    } else {
      if (isProd) {
        this.failClosedPaymentProvider('Payment provider not configured');
      }
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
        paykuLiveDisabled || !paykuApiUrl || paymentUrl === mockPaymentUrl,
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

    const paymentId = scalarToString(
      body.payment_id ?? body.paymentId ?? body.id,
    ).trim();

    this.logger.log('Payku webhook authenticated', {
      event: 'payku_webhook_authenticated',
      paymentIdHint: paymentId,
    });

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
    const postCommitActions: PostCommitAction[] = [];
    const result = await this.dataSource.transaction<WebhookResult>(
      async (manager) => {
      const repo = manager.getRepository(PaykuPayment);

      const payment = await repo.findOne({
        where: { id: paymentId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!payment) {
        postCommitActions.push(() => {
          this.logger.warn(`Payment ${paymentId} not found`);
        });
        postCommitActions.push(() => {
          void this.auditService.logError({
            action: 'PAYKU_WEBHOOK_PAYMENT_NOT_FOUND',
            resource: 'payment',
            resourceId: paymentId,
            userId: null,
            clinicId: null,
            httpStatus: 200,
            errorMessage: 'Payment not found',
          });
        });
        return { action: 'payment_not_found', paymentId };
      }

      const statusBefore = payment.status;

      if (isFinalStatus(payment.status)) {
        const isDuplicate = payment.status === incomingStatus;
        postCommitActions.push(() => {
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
        });
        return { action: 'already_final', paymentId, duplicate: true };
      }

      const expiredAgeMinutes = this.expireIfStale(payment);
      if (expiredAgeMinutes !== null) {
        postCommitActions.push(() => {
          this.logger.log(
            `Payment ${payment.id} auto-expired (age: ${expiredAgeMinutes}min)`,
          );
        });
      }

      if (isFinalStatus(payment.status) && payment.status !== incomingStatus) {
        await repo.save(payment);
        postCommitActions.push(() => {
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
        });
        return { action: 'expired_before_webhook', paymentId };
      }

      if (!isTransitionAllowed(payment.status, incomingStatus)) {
        postCommitActions.push(() => {
          this.logger.warn(
            `Invalid transition ${payment.status} → ${incomingStatus} for ${paymentId}`,
          );
        });
        postCommitActions.push(() => {
          void this.auditService.logError({
            action: 'PAYMENT_STATUS_UPDATED',
            resource: 'payment',
            resourceId: paymentId,
            userId: payment.userId,
            clinicId: payment.clinicId,
            httpStatus: 200,
            errorMessage: `Invalid transition: ${payment.status} → ${incomingStatus}`,
          });
        });
        return { action: 'invalid_transition', paymentId };
      }

      if (incomingStatus === PaykuPaymentStatus.PAID) {
        if (incomingAmount == null) {
          postCommitActions.push(() => {
            this.logger.warn(`Missing amount in paid webhook for ${paymentId}`);
          });
          postCommitActions.push(() => {
            void this.auditService.logError({
              action: 'PAYMENT_STATUS_UPDATED',
              resource: 'payment',
              resourceId: paymentId,
              userId: payment.userId,
              clinicId: payment.clinicId,
              httpStatus: 200,
              errorMessage: 'Missing amount in webhook payload',
            });
          });
          return { action: 'missing_amount', paymentId };
        }

        if (incomingAmount !== payment.amount) {
          postCommitActions.push(() => {
            this.logger.warn(
              `Amount mismatch for ${paymentId}: expected ${payment.amount}, got ${incomingAmount}`,
            );
          });
          postCommitActions.push(() => {
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
          });
          return { action: 'amount_mismatch', paymentId };
        }
      }

      payment.status = incomingStatus;
      payment.rawResponse = rawBody;
      const webhookIp = firstString(
        rawBody._ip,
        rawBody.ip,
        rawBody.remote_ip,
        rawBody.remoteIp,
      );
      if (webhookIp) {
        payment.metadata = {
          ...(payment.metadata ?? {}),
          paykuWebhookIp: webhookIp,
        };
      }

      if (incomingStatus === PaykuPaymentStatus.PAID) {
        payment.transactionId =
          scalarToString(
            rawBody.transaction_id ?? rawBody.transactionId,
          ).trim() || null;
        payment.paidAt = new Date();
      }

      const fraud = await this.detectFraudSignals(manager, payment, webhookIp);
      payment.fraudFlag = fraud.fraudFlag;
      payment.riskScore = fraud.riskScore;
      payment.fraudReason = fraud.fraudReason;
      payment.metadata = withFraudActionMetadata(payment.metadata, fraud);

      await repo.save(payment);
      this.enqueueFraudResponseLogs(postCommitActions, payment, fraud);
      if (fraud.fraudFlag) {
        postCommitActions.push(() =>
          this.logger.warn('payku_fraud_flagged', {
            paymentId,
            userId: payment.userId,
            clinicId: payment.clinicId,
            riskScore: fraud.riskScore,
            reason: fraud.fraudReason,
          });
        );
      }

      const outboxType =
        incomingStatus === PaykuPaymentStatus.PAID
          ? EventOutboxType.PAYMENT_SUCCEEDED
          : incomingStatus === PaykuPaymentStatus.FAILED
            ? EventOutboxType.PAYMENT_FAILED
            : EventOutboxType.PAYMENT_STATUS_UPDATED;
      const outboxKey =
        incomingStatus === PaykuPaymentStatus.PAID
          ? `payku:${paymentId}:payment_succeeded`
          : incomingStatus === PaykuPaymentStatus.FAILED
            ? `payku:${paymentId}:payment_failed`
            : `payku:${paymentId}:status:${incomingStatus}`;

      await manager.query(
        `
          INSERT INTO event_outbox (type, idempotency_key, payload)
          VALUES ($1, $2, $3::jsonb)
          ON CONFLICT DO NOTHING
        `,
        [
          outboxType,
          outboxKey,
          JSON.stringify({
            userId: payment.userId,
            clinicId: payment.clinicId,
            paymentId,
            consultationId: payment.consultationId,
            amount: payment.amount,
            transactionId: payment.transactionId ?? null,
            incomingPaymentStatus: incomingStatus,
          }),
        ],
      );

      postCommitActions.push(() => {
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
      });

      if (incomingStatus === PaykuPaymentStatus.PAID) {
        postCommitActions.push(() => {
          this.logger.log('payku_payment_confirmed', {
            event: 'payku_payment_confirmed',
            paymentId,
            consultationId: payment.consultationId,
            clinicId: payment.clinicId,
            amount: payment.amount,
          });
        });
        postCommitActions.push(() => {
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
        });
      }

      if (incomingStatus === PaykuPaymentStatus.FAILED) {
        const meta = {
          event: 'payku_payment_failed',
          paymentId,
          consultationId: payment.consultationId,
          clinicId: payment.clinicId,
        };
        postCommitActions.push(() => {
          this.logger.error(
            'payku_payment_failed',
            new Error('Payku payment failed'),
            meta,
          );
        });
      }

      return { action: 'processed', paymentId };
      },
    );
    await this.runPostCommitActions(postCommitActions);
    return result;
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
      const expiredAgeMinutes = this.expireIfStale(p);
      if (p.status !== before) {
        await this.paymentsRepository.save(p);
        expired += 1;
        if (expiredAgeMinutes !== null) {
          this.logger.log(
            `Payment ${p.id} auto-expired (age: ${expiredAgeMinutes}min)`,
          );
        }
      }
    }

    if (expired > 0) {
      this.logger.log('payku_reconciliation_expired', {
        event: 'payku_reconciliation_expired',
        count: expired,
      });
    }
  }

  private expireIfStale(payment: PaykuPayment): number | null {
    if (payment.status !== PaykuPaymentStatus.PENDING) return null;

    const ageMs = Date.now() - payment.createdAt.getTime();
    const limitMs = this.pendingExpireMinutes * 60_000;

    if (ageMs > limitMs) {
      payment.status = PaykuPaymentStatus.EXPIRED;
      return Math.round(ageMs / 60_000);
    }

    return null;
  }

  private async applyFraudSignals(payment: PaykuPayment): Promise<void> {
    const fraud = await this.detectFraudSignals(null, payment, null);
    if (fraud.riskScore <= 0 && !fraud.fraudReason) return;

    await this.paymentsRepository.query(
      `
        UPDATE payku_payments
        SET fraud_flag = $2,
            risk_score = $3,
            fraud_reason = $4,
            metadata = $5::jsonb
        WHERE id = $1
      `,
      [
        payment.id,
        fraud.fraudFlag,
        fraud.riskScore,
        fraud.fraudReason,
        JSON.stringify(withFraudActionMetadata(payment.metadata, fraud)),
      ],
    );
    await this.runPostCommitActions([
      ...this.buildFraudResponseLogActions(payment, fraud),
    ]);
    if (!fraud.fraudFlag) return;

    this.logger.warn('payku_fraud_flagged', {
      paymentId: payment.id,
      userId: payment.userId,
      clinicId: payment.clinicId,
      riskScore: fraud.riskScore,
      reason: fraud.fraudReason,
    });
  }

  private enqueueFraudResponseLogs(
    actions: PostCommitAction[],
    payment: Pick<PaykuPayment, 'id' | 'userId' | 'clinicId'>,
    fraud: FraudCheckResult,
  ): void {
    actions.push(...this.buildFraudResponseLogActions(payment, fraud));
  }

  private buildFraudResponseLogActions(
    payment: Pick<PaykuPayment, 'id' | 'userId' | 'clinicId'>,
    fraud: FraudCheckResult,
  ): PostCommitAction[] {
    const actions = fraudResponseActions(fraud.riskScore);
    const base = {
      paymentId: payment.id,
      userId: payment.userId,
      clinicId: payment.clinicId,
      riskScore: fraud.riskScore,
      fraudReason: fraud.fraudReason,
      highRisk: actions.highRisk,
      rateLimitFlag: actions.rateLimitFlag,
    };
    const logs: PostCommitAction[] = [];

    if (actions.critical) {
      logs.push(() =>
        this.logger.error('fraud_critical', new Error('fraud_critical'), base),
      );
    }

    if (actions.highRisk) {
      logs.push(() =>
        this.logger.warn('fraud_high_risk', {
          ...base,
          userRiskStatus: 'high_risk',
        }),
      );
    }

    return logs;
  }

  private async queryPaykuRows<T extends object>(
    manager: EntityManager | null,
    sql: string,
    parameters: unknown[],
  ): Promise<T[]> {
    if (manager) {
      return manager.query<T[]>(sql, parameters);
    }

    return this.paymentsRepository.query<T[]>(sql, parameters);
  }

  private async detectFraudSignals(
    manager: EntityManager | null,
    payment: Pick<
      PaykuPayment,
      | 'id'
      | 'userId'
      | 'status'
      | 'fraudFlag'
      | 'riskScore'
      | 'fraudReason'
    >,
    ip: string | null,
  ): Promise<FraudCheckResult> {
    const reasons: string[] = [];
    let riskScore = 0;

    const recentPayments = await this.queryPaykuRows<CountRow>(
      manager,
      `
        SELECT count(*)::int AS count
        FROM payku_payments
        WHERE user_id = $1
          AND created_at >= now() - interval '60 seconds'
      `,
      [payment.userId],
    );
    if ((recentPayments[0]?.count ?? 0) > 3) {
      reasons.push('more_than_3_payments_in_60_seconds_per_user');
      riskScore += 30;
    }

    if (ip) {
      const sharedIpUsers = await this.queryPaykuRows<CountRow>(
        manager,
        `
          SELECT count(DISTINCT user_id)::int AS count
          FROM payku_payments
          WHERE metadata->>'paykuWebhookIp' = $1
            AND user_id <> $2
        `,
        [ip, payment.userId],
      );
      if ((sharedIpUsers[0]?.count ?? 0) > 0) {
        reasons.push('same_ip_across_multiple_users');
        riskScore += 20;
      }
    }

    if (payment.status === PaykuPaymentStatus.FAILED) {
      const failedPayments = await this.queryPaykuRows<CountRow>(
        manager,
        `
          SELECT count(*)::int AS count
          FROM payku_payments
          WHERE user_id = $1
            AND status = $2
            AND updated_at >= now() - interval '1 hour'
        `,
        [payment.userId, PaykuPaymentStatus.FAILED],
      );
      if ((failedPayments[0]?.count ?? 0) >= 3) {
        reasons.push('repeated_failed_payments');
        riskScore += 25;
      }
    }

    const userAge = await this.queryPaykuRows<UserCreatedAtRow>(
      manager,
      `
        SELECT created_at
        FROM users
        WHERE id = $1
          AND created_at >= now() - interval '24 hours'
        LIMIT 1
      `,
      [payment.userId],
    );
    if (userAge.length > 0) {
      reasons.push('new_user_less_than_24h_old');
      riskScore += 10;
    }

    riskScore = Math.min(100, riskScore);

    const fraudReason = Array.from(
      new Set([
        ...((payment.fraudReason ?? '')
          .split(',')
          .map((reason) => reason.trim())
          .filter((reason): reason is string => reason.length > 0)),
        ...reasons,
      ]),
    ).join(',');

    return {
      fraudFlag: riskScore >= 50,
      riskScore,
      fraudReason: fraudReason.length > 0 ? fraudReason : null,
    };
  }

  private resolveStatus(
    body: Record<string, unknown>,
  ): PaykuPaymentStatus | null {
    const raw = scalarToString(
      body.status ?? body.payment_status ?? body.estado,
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
