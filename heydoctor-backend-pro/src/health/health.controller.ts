import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('/healthz')
  healthz() {
    return 'ok';
  }

  @Get('/_health')
  railwayHealth() {
    return { status: 'ok' };
  }
}
