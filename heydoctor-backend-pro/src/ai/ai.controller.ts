import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { RequirePlan } from '../subscriptions/decorators/require-plan.decorator';
import { FeatureGuard } from '../subscriptions/guards/feature.guard';
import { SubscriptionPlan } from '../subscriptions/subscription.entity';
import type {
  ClinicalSummaryResult,
  ConsultationAssistResult,
} from './ai.types';
import { AiService } from './ai.service';
import { ConsultationAssistDto } from './dto/consultation-assist.dto';
import { ConsultationSummaryQueryDto } from './dto/consultation-summary-query.dto';

@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('ai')
@UseGuards(JwtAuthGuard, FeatureGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Asistencia clínica libre (motivo / síntomas / notas). Sin requisito PRO
   * para que el panel funcione sin bloqueo de suscripción.
   */
  @Post('consultation-assist')
  consultationAssist(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConsultationAssistDto,
  ): Promise<ConsultationAssistResult> {
    return this.aiService.generateConsultationAssist(dto, user);
  }

  @Post('consultation-summary')
  @RequirePlan(SubscriptionPlan.PRO)
  consultationSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConsultationSummaryQueryDto,
  ): Promise<ClinicalSummaryResult> {
    return this.aiService.generateClinicalSummaryForConsultation(
      dto.consultationId,
      user,
    );
  }
}
