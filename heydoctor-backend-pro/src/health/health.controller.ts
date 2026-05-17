import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService, type ReadinessResponse } from './health.service';

@Public()
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @SkipThrottle()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Get('/healthz')
  healthz() {
    return 'ok';
  }

  @SkipThrottle()
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Get('/livez')
  livez() {
    return this.healthService.liveness();
  }

  @SkipThrottle()
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Get('/readyz')
  async readyz(@Res({ passthrough: true }) res: Response) {
    const readiness = await this.healthService.readiness();
    if (!readiness.ok) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return readiness;
  }
}

/**
 * GET /api/health — mismo prefijo global que el resto del API (útil para probar integración).
 */
@Public()
@Controller('health')
export class HealthApiController {
  constructor(private readonly healthService: HealthService) {}

  @SkipThrottle()
  @Get()
  health(): {
    ok: true;
    service: string;
    status: 'ok';
    uptime: number;
  } {
    return {
      ok: true,
      service: 'heydoctor-backend-pro',
      status: 'ok',
      uptime: process.uptime(),
    };
  }

  @SkipThrottle()
  @Get('live')
  liveness() {
    return this.healthService.liveness();
  }

  @SkipThrottle()
  @Get('ready')
  async readiness(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessResponse> {
    const readiness = await this.healthService.readiness();
    if (!readiness.ok) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return readiness;
  }

  @SkipThrottle()
  @Get('version')
  @HttpCode(HttpStatus.OK)
  version() {
    return this.healthService.release();
  }
}
