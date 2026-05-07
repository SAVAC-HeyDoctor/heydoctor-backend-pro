import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { GrowthAnalyticsService } from './growth-analytics.service';

@Controller('admin/growth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminGrowthInsightsController {
  constructor(private readonly growthAnalytics: GrowthAnalyticsService) {}

  @Get('summary')
  summary() {
    return this.growthAnalytics.getSummary();
  }

  @Get('alerts')
  alerts() {
    return this.growthAnalytics.getAlerts();
  }

  @Get('funnel')
  funnel() {
    return this.growthAnalytics.getFunnelDashboard();
  }

  @Get('retention')
  retention(@Query('days') daysRaw?: string) {
    const parsed =
      daysRaw
        ?.split(',')
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n) && n > 0) ?? [];
    return this.growthAnalytics.getRetention(
      parsed.length ? parsed : [1, 7, 30],
    );
  }
}
