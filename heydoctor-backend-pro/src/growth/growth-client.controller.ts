import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { StartGrowthCheckoutDto, TrackProductEventDto } from './dto/growth.dto';
import { ExperimentsService } from './experiments.service';
import { GrowthCheckoutService } from './growth-checkout.service';
import { FeatureFlagsService } from './feature-flags.service';
import { GrowthPublicTrackableEvents } from './growth-event-names';
import { ProductEventsService } from './product-events.service';

@Controller('growth')
export class GrowthClientController {
  constructor(
    private readonly flags: FeatureFlagsService,
    private readonly experiments: ExperimentsService,
    private readonly productEvents: ProductEventsService,
    private readonly growthCheckout: GrowthCheckoutService,
  ) {}

  @Get('context')
  @UseGuards(JwtAuthGuard)
  async context(@CurrentUser() user: AuthenticatedUser) {
    const uid = user.sub;
    const [features, variants] = await Promise.all([
      this.flags.evaluatedForUser(uid),
      this.experiments.assignmentsForUser(uid),
    ]);
    return { features, experiments: variants, userId: uid };
  }

  /** Sin sesión: solo flags globales viables (rollout al 100% o desactivadas). */
  @Get('context-public')
  @Public()
  async contextPublic() {
    const flags = await this.flags.evaluatedForUser(null);
    const experiments: Record<string, string | null> = {};
    const userId: string | null = null;
    return {
      features: flags,
      experiments,
      userId,
    };
  }

  /**
   * Asignación estable de variante para visitantes anónimos (misma clave que en context autenticado).
   * `anonId` debe coincidir con `properties.anonSessionId` en events-public.
   */
  @Public()
  @Get('experiment-preview')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async experimentPreview(
    @Query('key') experimentKey?: string,
    @Query('anonId') anonId?: string,
  ) {
    const key = experimentKey?.trim();
    if (!key) {
      throw new BadRequestException('query key is required');
    }
    if (!anonId || anonId.length < 12 || anonId.length > 128) {
      throw new BadRequestException('anonId must be 12–128 characters');
    }
    const variant = await this.experiments.getVariant(
      `anon:${anonId.trim()}`,
      key,
    );
    return { variant };
  }

  /** Embudo pre-login: solo eventos en GrowthPublicTrackableEvents + anonSessionId. */
  @Public()
  @Post('events-public')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async trackPublic(@Body() dto: TrackProductEventDto) {
    const name = dto.eventName?.trim();
    if (!name || !GrowthPublicTrackableEvents.has(name)) {
      throw new BadRequestException('Event not allowed without session');
    }
    const props = dto.properties ?? {};
    const anon = props.anonSessionId;
    if (typeof anon !== 'string' || anon.length < 12 || anon.length > 128) {
      throw new BadRequestException(
        'properties.anonSessionId required (12–128 chars)',
      );
    }
    await this.productEvents.track(null, name, props);
    return { ok: true };
  }

  /**
   * Checkout Payku PRO directo desde /pricing (con o sin JWT). Anónimos: `anonSessionId` estable (12–128).
   */
  @Public()
  @Post('start-checkout')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async startCheckout(
    @Req() req: Request,
    @Body() dto: StartGrowthCheckoutDto,
  ): Promise<{ checkoutUrl: string; paymentId: string }> {
    return this.growthCheckout.startCheckoutFromPricing(req, dto);
  }

  @Post('events')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async track(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TrackProductEventDto,
  ) {
    await this.productEvents.track(user.sub, dto.eventName, dto.properties);
    return { ok: true };
  }
}
