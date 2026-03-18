import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  getRoot() {
    return { status: 'ok', message: 'HeyDoctor NestJS API' };
  }

  @Public()
  @Get('health')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
