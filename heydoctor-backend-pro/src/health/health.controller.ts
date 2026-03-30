import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
export class HealthController {
  @SkipThrottle()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Get('/healthz')
  healthz() {
    return 'ok';
  }

  @SkipThrottle()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Get('/_health')
  railwayHealth() {
    return 'ok';
  }
}
