import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { RequestTraceIndexService } from '../common/observability/request-trace-index.service';
import { getSocketIoRedisHealth } from '../common/websocket/socket-io-health';
import {
  OpsAsyncReliabilityService,
  type AsyncReliabilityDiagnostics,
} from './ops-async-reliability.service';
import type { OpsOverviewDto } from './ops-overview.dto';
import {
  OpsDataReliabilityService,
  type DataReliabilityDiagnostics,
} from './ops-data-reliability.service';
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
    private readonly dataReliability: OpsDataReliabilityService,
    private readonly asyncReliability: OpsAsyncReliabilityService,
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

  /** Estado del adapter distribuido Socket.IO (Redis) para diagnosticar señalización. */
  @Get('socket-io')
  socketIo() {
    return getSocketIoRedisHealth();
  }

  /** Diagnóstico sin PHI sobre backups, retención, crecimiento y orfandad de datos. */
  @Get('data-reliability')
  dataReliabilityDiagnostics(): Promise<DataReliabilityDiagnostics> {
    return this.dataReliability.getDiagnostics();
  }

  /** Diagnóstico de workers, outbox, reintentos y pagos async sin payloads sensibles. */
  @Get('async-reliability')
  asyncReliabilityDiagnostics(): Promise<AsyncReliabilityDiagnostics> {
    return this.asyncReliability.getDiagnostics();
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
