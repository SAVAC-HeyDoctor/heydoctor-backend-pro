import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TrackProductEventDto } from './dto/growth.dto';
import { ExperimentsService } from './experiments.service';
import { FeatureFlagsService } from './feature-flags.service';
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
