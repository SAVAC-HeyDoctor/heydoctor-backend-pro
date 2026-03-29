console.log('>>> MAIN.TS LOADED');

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditService } from './audit/audit.service';
import { AuthorizationService } from './authorization/authorization.service';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('>>> BOOTSTRAP START');

  const app = await NestFactory.create(AppModule, { rawBody: true });
  console.log('>>> NestFactory.create DONE');

  app.use(cookieParser());
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalGuards(app.get(ThrottlerGuard));
  app.use(new RequestIdMiddleware().use);

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  const auditService = app.get(AuditService);
  const authorizationService = app.get(AuthorizationService);
  app.useGlobalInterceptors(
    new AuditInterceptor(auditService, authorizationService),
  );
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN')?.split(',').map((s) => s.trim()) ?? true,
    credentials: true,
  });

  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = Number.parseInt(
    config.get<string>('PORT') ?? '3001',
    10,
  );
  await app.listen(port);
  console.log(`>>> APP LISTENING ON PORT ${port}`);
}
void bootstrap();
