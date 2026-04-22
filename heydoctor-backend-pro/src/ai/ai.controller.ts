import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { RequirePlan } from '../subscriptions/decorators/require-plan.decorator';
import { FeatureGuard } from '../subscriptions/guards/feature.guard';
import { SubscriptionPlan } from '../subscriptions/subscription.entity';
import type { ClinicalSummaryResult } from './ai.types';
import { AiService } from './ai.service';
import { ConsultationSummaryQueryDto } from './dto/consultation-summary-query.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard, FeatureGuard)
@RequirePlan(SubscriptionPlan.PRO)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('consultation-summary')
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
