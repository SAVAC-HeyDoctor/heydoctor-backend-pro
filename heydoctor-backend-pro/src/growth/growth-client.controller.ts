import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TrackProductEventDto } from './dto/growth.dto';
import { ExperimentsService } from './experiments.service';
import { FeatureFlagsService } from './feature-flags.service';
import { GrowthPublicTrackableEvents } from './growth-event-names';
import { ProductEventsService } from './product-events.service';

@Controller('growth')
export class GrowthClientController {
  constructor(
    private readonly flags: FeatureFlagsService,
    private readonly experiments: ExperimentsService,
    private readonly productEvents: ProductEventsService,
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
    return {
      features: flags,
      experiments: {} as Record<string, string | null>,
      userId: null as string | null,
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
