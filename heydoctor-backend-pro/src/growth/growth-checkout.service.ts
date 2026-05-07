import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
  type LoggerService,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth-cookies';
import type { JwtPayload } from '../auth/types/jwt-payload.interface';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { PaykuService } from '../payku/payku.service';
import { UsersService } from '../users/users.service';
import type { StartGrowthCheckoutDto } from './dto/growth.dto';
import { GrowthFunnelEvents } from './growth-event-names';
import { ProductEventsService } from './product-events.service';

@Injectable()
export class GrowthCheckoutService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => PaykuService))
    private readonly paykuService: PaykuService,
    private readonly productEvents: ProductEventsService,
    @Inject(APP_LOGGER)
    private readonly logger: LoggerService,
  ) {}

  private readAccessCookie(req: Request): string | undefined {
    const v = req.cookies?.[ACCESS_TOKEN_COOKIE];
    return typeof v === 'string' ? v : undefined;
  }

  private async verifyAccess(req: Request): Promise<JwtPayload | null> {
    const raw = this.readAccessCookie(req);
    if (!raw) return null;
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(raw);
    } catch {
      return null;
    }
  }

  async startCheckoutFromPricing(
    req: Request,
    dto: StartGrowthCheckoutDto,
  ): Promise<{ checkoutUrl: string; paymentId: string }> {
    const payload = await this.verifyAccess(req);
    let userId: string;
    let clinicId: string;
    let payerEmail: string;

    if (payload) {
      const user = await this.usersService.findById(payload.sub);
      if (!user) throw new UnauthorizedException();
      userId = user.id;
      clinicId = user.clinicId;
      payerEmail = (payload.email || user.email).trim();
    } else {
      if (!dto.anonSessionId) {
        throw new BadRequestException(
          'anonSessionId is required when not authenticated',
        );
      }
      const guest = await this.usersService.ensureGuestUserForProPricing(
        dto.anonSessionId,
      );
      userId = guest.id;
      clinicId = guest.clinicId;
      payerEmail = guest.email.trim();
    }

const amount = (() => {
    const direct = Number(
      this.config.get<string>('PRICING_PRO_CHECKOUT_AMOUNT_CLP') ?? '',
    );
    if (Number.isFinite(direct) && direct > 0) return direct;
    const subReplay = Number(
      this.config.get<string>('SUBSCRIPTION_PRO_MONTHLY_PRICE') ?? '0',
    );
    if (Number.isFinite(subReplay) && subReplay > 0) return subReplay;
    return Number(
      this.config.get<string>('CONSULTATION_PAYMENT_AMOUNT_CLP') ?? '15000',
    );
  })();

    const experimentKey = dto.experimentKey?.trim() || 'pricing_upgrade_cta';
    const variant = dto.variant?.trim() || null;

    const metadata: Record<string, unknown> = {
      kind: 'pricing_pro',
      source: 'pricing_page',
      plan: dto.plan,
      experiment: experimentKey,
      variant,
      anonSessionId: dto.anonSessionId?.trim() ?? null,
    };

    const { paymentId, paymentUrl } =
      await this.paykuService.createPricingProCheckout({
        userId,
        clinicId,
        email: payerEmail,
        amount,
        metadata,
      });

    void this.productEvents
      .track(userId, GrowthFunnelEvents.START_CHECKOUT, {
        paymentId,
        source: 'pricing_page',
        experiment: experimentKey,
        variant,
        plan: dto.plan,
        anonSessionId: dto.anonSessionId ?? null,
      })
      .catch(() => undefined);

    this.logger.log('growth_pricing_checkout_started', {
      userId,
      paymentId,
      experiment: experimentKey,
      variant,
    });

    return { checkoutUrl: paymentUrl, paymentId };
  }
}
