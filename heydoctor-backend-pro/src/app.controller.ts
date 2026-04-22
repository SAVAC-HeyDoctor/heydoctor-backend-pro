import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './auth/decorators/public.decorator';

@Public()
@Controller()
export class AppController {
  @SkipThrottle()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Get('/')
  root() {
    return 'ok';
  }

  @SkipThrottle()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Get('/health')
  health() {
    return 'ok';
  }
}
