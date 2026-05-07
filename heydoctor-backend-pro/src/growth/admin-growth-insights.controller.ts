import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
