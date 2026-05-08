import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { RequestTraceIndexService } from '../common/observability/request-trace-index.service';
import type { OpsOverviewDto } from './ops-overview.dto';
import { OpsOverviewService } from './ops-overview.service';
import type { OpsScalingDto } from './ops-scaling.service';
import { OpsScalingService } from './ops-scaling.service';

@Controller('admin/ops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminOpsController {
  constructor(
    private readonly opsOverview: OpsOverviewService,
    private readonly opsScaling: OpsScalingService,
    private readonly requestTraceIndex: RequestTraceIndexService,
  ) {}

  @Get('overview')
  overview(): Promise<OpsOverviewDto> {
    return this.opsOverview.getOverview();
  }

  /** Métricas orientadas a políticas de escalado (Railway aplica CPU/RAM en panel). */
  @Get('scaling')
  scaling(): Promise<OpsScalingDto> {
    return this.opsScaling.getScaling();
  }

  /** Búsqueda de request por `X-Request-Id` / traceId (índice en memoria de esta réplica). */
  @Get('traces/:requestId')
  traceLookup(@Param('requestId') requestId: string) {
    const entry = this.requestTraceIndex.findByRequestId(requestId);
    if (!entry) {
      return { found: false, requestId };
    }
    return { found: true, entry };
  }
}
