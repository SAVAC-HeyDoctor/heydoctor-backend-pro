import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { RecordWebrtcMetricDto } from './dto/record-webrtc-metric.dto';
import { WebrtcService } from './webrtc.service';

/**
 * HTTP companion to the WebRTC Socket.IO gateway. The signaling itself runs
 * over `/webrtc` namespace; this controller only exposes:
 *   - GET /webrtc/ice-servers      → STUN/TURN config for the call
 *   - POST /webrtc/metrics         → telemetry samples (no media, no SDP)
 *   - GET /webrtc/metrics/summary  → aggregated quality summary
 *
 * Auth uses the global JwtAuthGuard. Access to a specific consultation is
 * enforced inside {@link WebrtcService} via `verifySignalingAccess`.
 */
@Controller('webrtc')
export class WebrtcController {
  constructor(private readonly webrtcService: WebrtcService) {}

  @Get('ice-servers')
  async iceServers(
    @CurrentUser() user: AuthenticatedUser,
    @Query('consultationId', new ParseUUIDPipe({ version: '4' }))
    consultationId: string,
  ) {
    const iceServers = await this.webrtcService.getIceServers(
      consultationId,
      user,
    );
    return { iceServers };
  }

  @Post('metrics')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordMetric(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordWebrtcMetricDto,
  ): Promise<void> {
    await this.webrtcService.recordMetric(dto, user);
  }

  @Get('metrics/summary')
  async metricsSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('consultationId', new ParseUUIDPipe({ version: '4' }))
    consultationId: string,
  ) {
    return this.webrtcService.getMetricsSummary(consultationId, user);
  }
}
