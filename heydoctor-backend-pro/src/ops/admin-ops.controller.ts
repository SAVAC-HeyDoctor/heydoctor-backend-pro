import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import type { OpsOverviewDto } from './ops-overview.dto';
import { OpsOverviewService } from './ops-overview.service';

@Controller('admin/ops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminOpsController {
  constructor(private readonly opsOverview: OpsOverviewService) {}

  @Get('overview')
  overview(): Promise<OpsOverviewDto> {
    return this.opsOverview.getOverview();
  }
}
