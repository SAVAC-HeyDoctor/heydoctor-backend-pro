import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
export class HealthController {
  @SkipThrottle()
  @Get('/healthz')
  healthz() {
    return 'ok';
  }

  @SkipThrottle()
  @Get('/_health')
  railwayHealth() {
    return { status: 'ok' };
  }
}
