import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import {
  SubscriptionChangeSource,
  SubscriptionPlan,
} from '../subscriptions/subscription.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UserRole } from '../users/user-role.enum';

const SYSTEM_USER: AuthenticatedUser = {
  sub: 'system-stripe-webhook',
  email: 'system@heydoctor.internal',
  role: UserRole.ADMIN,
};

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly logger = new Logger(PaymentsService.name);
  private readonly successUrl: string;
  private readonly cancelUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly auditService: AuditService,
  ) {
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
    const webhookSec = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    console.log('[ENV] STRIPE_SECRET_KEY:', stripeKey ? 'SET' : 'MISSING');
    console.log('[ENV] STRIPE_WEBHOOK_SECRET:', webhookSec ? 'SET' : 'MISSING');
    this.stripe = new Stripe(
      stripeKey || 'sk_missing_placeholder',
      { apiVersion: '2026-03-25.dahlia' },
    );
    this.webhookSecret = webhookSec || '';
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    this.successUrl = `${frontendUrl}/panel/admin?payment=success`;
    this.cancelUrl = `${frontendUrl}/panel/admin?payment=cancel`;
  }

  async createCheckoutSession(
    authUser: AuthenticatedUser,
  ): Promise<{ sessionId: string; url: string }> {
    const priceId = this.config.get<string>('STRIPE_PRO_PRICE_ID') || '';
    if (!priceId) {
      throw new Error('STRIPE_PRO_PRICE_ID not configured');
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: authUser.sub,
      customer_email: authUser.email,
      success_url: this.successUrl,
      cancel_url: this.cancelUrl,
    });

    void this.auditService.logSuccess({
      action: 'STRIPE_CHECKOUT_CREATED',
      resource: 'payment',
      resourceId: session.id,
      userId: authUser.sub,
      clinicId: null,
      httpStatus: 201,
      metadata: {
        sessionId: session.id,
        priceId,
      },
    });

    return { sessionId: session.id, url: session.url! };
  }

  async handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      this.logger.warn(
        `Webhook signature verification failed: ${(err as Error).message}`,
      );
      throw new BadRequestException('Invalid Stripe signature');
    }

    if (event.type === 'checkout.session.completed') {
      await this.onCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
      );
    }
  }

  private async onCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const userId = session.client_reference_id;
    if (!userId) {
      this.logger.warn(
        `checkout.session.completed without client_reference_id: ${session.id}`,
      );
      return;
    }

    await this.subscriptionsService.updatePlan(
      userId,
      SubscriptionPlan.PRO,
      SYSTEM_USER,
      SubscriptionChangeSource.STRIPE,
      'stripe payment',
    );

    void this.auditService.logSuccess({
      action: 'STRIPE_PAYMENT_COMPLETED',
      resource: 'payment',
      resourceId: session.id,
      userId,
      clinicId: null,
      httpStatus: 200,
      metadata: {
        stripeSessionId: session.id,
        customerId: session.customer,
        subscriptionId: session.subscription,
      },
    });

    this.logger.log(`User ${userId} upgraded to PRO via Stripe`);
  }
}
