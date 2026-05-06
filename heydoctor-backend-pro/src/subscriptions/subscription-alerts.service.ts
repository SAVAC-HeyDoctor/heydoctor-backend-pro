import { Injectable, Logger } from '@nestjs/common';
import { notifyAlert } from '../common/alerts/alert.hooks';

export type SubscriptionPaymentFailedContext = {
  userId: string;
  clinicId: string;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class SubscriptionAlertsService {
  private readonly logger = new Logger(SubscriptionAlertsService.name);

  /** Pago fallido (Payku). No lanza; notifica sinks vía {@link notifyAlert}. */
  notifyPaymentFailed(event: SubscriptionPaymentFailedContext): void {
    const paymentId = event.metadata?.paymentId as string | undefined;
    this.logger.warn('subscription_alert.payment_failed', {
      userId: event.userId,
      clinicId: event.clinicId,
      ...(paymentId ? { paymentId } : {}),
    });
    notifyAlert({
      ...(event.metadata ?? {}),
      alert: 'subscription_payment_failed',
      userId: event.userId,
      clinicId: event.clinicId,
    });
  }
}
