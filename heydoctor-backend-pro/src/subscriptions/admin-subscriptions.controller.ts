import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/user-role.enum';
import { UpdateSubscriptionStatusDto } from './dto/update-subscription-status.dto';
import { SubscriptionEventsService } from './subscription-events.service';
import { SubscriptionsAnalyticsService } from './subscriptions-analytics.service';
import { SubscriptionsService } from './subscriptions.service';

@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSubscriptionsController {
  constructor(
    private readonly subscriptionEvents: SubscriptionEventsService,
    private readonly subscriptionsAnalytics: SubscriptionsAnalyticsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get('summary')
  getSummary(): ReturnType<SubscriptionsAnalyticsService['getSummary']> {
    return this.subscriptionsAnalytics.getSummary();
  }

  @Get('metrics')
  getMetrics(): ReturnType<SubscriptionsAnalyticsService['getMetrics']> {
    return this.subscriptionsAnalytics.getMetrics();
  }

  /** Serie MRR desde `subscription_events` (MONTH UTC, suma amounts). */
  @Get('mrr')
  getMrr(
    @Query('months', new DefaultValuePipe(12), ParseIntPipe) months: number,
  ): Promise<unknown> {
    return this.subscriptionsAnalytics.getMrr(months);
  }

  /** Retención por cohortes (alta desde SUBSCRIPTION_CREATED; baja vía deactivate/expired). */
  @Get('cohorts')
  getCohorts(
    @Query('months', new DefaultValuePipe(12), ParseIntPipe) months: number,
    @Query('horizon', new DefaultValuePipe(6), ParseIntPipe) horizon: number,
  ): Promise<unknown> {
    return this.subscriptionsAnalytics.getCohorts({
      cohortMonthsLookback: months,
      horizonMonths: horizon,
    });
  }

  /** Churn mensual event-based (SUBSCRIPTION_DEACTIVATED / SUBSCRIPTION_EXPIRED). */
  @Get('churn')
  getChurn(
    @Query('months', new DefaultValuePipe(12), ParseIntPipe) months: number,
  ): Promise<unknown> {
    return this.subscriptionsAnalytics.getChurn(months);
  }

  @Patch(':userId/status')
  patchStatus(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() dto: UpdateSubscriptionStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subscriptionsService.updateSubscriptionStatus(
      userId,
      dto.status,
      user,
      dto.reason,
    );
  }

  @Get(':userId/events')
  listEventsForUser(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ): ReturnType<SubscriptionEventsService['findByUserId']> {
    return this.subscriptionEvents.findByUserId(userId);
  }
}
