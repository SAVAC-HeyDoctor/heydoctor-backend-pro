import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { Consultation } from '../consultations/consultation.entity';
import { ConsultationStatus } from '../consultations/consultation-status.enum';
import {
  SubscriptionChangeSource,
  SubscriptionPlan,
} from '../subscriptions/subscription.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
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
  private readonly logger = new Logger(PaykuService.name);
  private readonly authConfig: PaykuWebhookAuthConfig;
  private readonly pendingExpireMinutes: number;

  constructor(
    @InjectRepository(PaykuPayment)
    private readonly paymentsRepository: Repository<PaykuPayment>,
    @InjectRepository(Consultation)
    private readonly consultationsRepository: Repository<Consultation>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly authorizationService: AuthorizationService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly auditService: AuditService,
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
    const saved = await this.paymentsRepository.save(payment);

    /**
     * Payku live: desactivar con PAYKU_CONSULTATION_PAYMENTS_DISABLED=true (revertir quitando o false).
     * Si la API falla o falta URL, se usa URL mock y se registra el error — sin 502 ni excepción al cliente.
     */
    let paymentUrl: string | undefined;
    const paykuApiUrl = this.config.get<string>('PAYKU_API_URL');
    const paykuApiKey = this.config.get<string>('PAYKU_API_KEY');
    const paykuLiveDisabled =
      this.config.get<string>('PAYKU_CONSULTATION_PAYMENTS_DISABLED') === 'true';

    const mockPaymentUrl = `${frontendUrl}/panel/consultas/${consultationId}?payment=mock&paymentId=${saved.id}`;

    if (paykuLiveDisabled) {
      this.logger.warn(
        'PAYKU_CONSULTATION_PAYMENTS_DISABLED=true: skipping live Payku API (mock checkout URL)',
      );
    } else if (paykuApiUrl && paykuApiKey) {
      try {
        const res = await fetch(`${paykuApiUrl}/transaction`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${paykuApiKey}`,
          },
          body: JSON.stringify({
            email: authUser.email,
            order: saved.id,
            subject: `Consulta médica HeyDoctor`,
            amount,
            currency: 'CLP',
            payment_id: saved.id,
            urlreturn: `${frontendUrl}/panel/consultas/${consultationId}?payment=success`,
            urlnotify: `${backendUrl}/api/payku/webhook`,
          }),
        });
        if (!res.ok) {
          this.logger.warn(
            `Payku HTTP ${res.status}: falling back to mock checkout URL`,
          );
        } else {
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
        }
      } catch (err) {
        this.logger.error(
          'Payku API call failed; using mock checkout URL',
          err instanceof Error ? err.stack : err,
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

    return { paymentId: saved.id, paymentUrl };
  }

  /**
   * Full webhook handler. Always returns a result (never throws to the caller).
   * The controller is responsible for returning 200 { ok: true } regardless.
   */
  async handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: Record<string, unknown>,
  ): Promise<WebhookResult> {
    try {
      assertPaykuWebhookAuthenticated(headers, body, this.authConfig);
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`Webhook auth failed: ${msg}`);
      void this.auditService.logError({
        action: 'PAYKU_WEBHOOK_AUTH_FAILED',
        resource: 'payment',
        resourceId: null,
        userId: null,
        clinicId: null,
        httpStatus: 401,
        errorMessage: msg,
        metadata: { ip: body._ip as string | undefined },
      });
      return { action: 'auth_failed', error: msg };
    }

    const paymentId = String(
      body.payment_id ?? body.paymentId ?? body.id ?? '',
    );
    if (!paymentId) {
      this.logger.warn('Webhook missing payment_id');
      return { action: 'missing_payment_id' };
    }

    const incomingStatus = this.resolveStatus(body);
    if (!incomingStatus) {
      this.logger.warn(`Webhook unknown status for payment ${paymentId}`);
      return { action: 'unknown_status', paymentId };
    }

    const incomingAmount = this.extractAmount(body);

    return this.processWebhookInTransaction(
      paymentId,
      incomingStatus,
      incomingAmount,
      body,
    );
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

      const statusBefore = payment.status;

      if (isFinalStatus(payment.status)) {
        const isDuplicate = payment.status === incomingStatus;
        void this.auditService.logSuccess({
          action: 'PAYMENT_STATUS_UPDATED',
          resource: 'payment',
          resourceId: paymentId,
          userId: payment.userId,
          clinicId: null,
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
          clinicId: null,
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
          clinicId: null,
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
            clinicId: null,
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
            clinicId: null,
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
        clinicId: null,
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
        try {
          await this.subscriptionsService.updatePlan(
            payment.userId,
            SubscriptionPlan.PRO,
            SYSTEM_USER,
            SubscriptionChangeSource.WEBHOOK,
            'payku payment',
          );
        } catch (err) {
          this.logger.error(
            `Failed to upgrade user ${payment.userId} after payment ${paymentId}`,
            err,
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
              err,
            );
          }
        }
      }

      return { action: 'processed', paymentId };
    });
  }

  private expireIfStale(payment: PaykuPayment): void {
    if (payment.status !== PaykuPaymentStatus.PENDING) return;

    const ageMs = Date.now() - payment.createdAt.getTime();
    const limitMs = this.pendingExpireMinutes * 60_000;

    if (ageMs > limitMs) {
      payment.status = PaykuPaymentStatus.EXPIRED;
      this.logger.log(`Payment ${payment.id} auto-expired (age: ${Math.round(ageMs / 60_000)}min)`);
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
