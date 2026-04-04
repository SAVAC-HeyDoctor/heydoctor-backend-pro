import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { logExpressRouteStackIfEnabled } from './common/bootstrap/log-express-routes';
import { validateAndLogEnv } from './config/env-startup-check';
import { EnvConfig, ENV_CONFIG_TOKEN } from './config/env.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppModule } from './app.module';
import type { Request, Response } from 'express';

const bootstrapLogger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const server = app.getHttpAdapter().getInstance();

  // Healthcheck ultra rápido para Railway (Express; no controllers / guards / ORM en la petición)
  server.get('/_health', (_req: Request, res: Response) => {
    res.status(200).send('ok');
  });

  app.use(cookieParser());
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.useWebSocketAdapter(new IoAdapter(app));

  /**
   * Prefijo global antes de guards: rutas y Throttler alineados con `/api/...`
   * (p. ej. `POST /api/auth/login` desde AuthModule / AuthController).
   */
  app.setGlobalPrefix('api', {
    exclude: [
      { path: '/', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
      { path: 'healthz', method: RequestMethod.GET },
      /** Links mágicos para pacientes (sin `/api` en SMS/email). */
      { path: 'appointments/confirm/(.*)', method: RequestMethod.GET },
      { path: 'appointments/cancel/(.*)', method: RequestMethod.GET },
    ],
  });

  app.use(new RequestIdMiddleware().use);
  /** Solo Throttler global; JwtAuthGuard aplica en rutas con @UseGuards (no bloquea login). */
  app.useGlobalGuards(app.get(ThrottlerGuard));

  const envConfig = app.get<EnvConfig>(ENV_CONFIG_TOKEN);
  const missingVars = validateAndLogEnv(envConfig);
  if (missingVars.length > 0 && envConfig.isProduction) {
    throw new Error(
      `Missing required env vars in production: ${missingVars.join(', ')}`,
    );
  }

  // List every frontend origin that calls this API with credentials (cookies + Bearer).
  const defaultCorsOrigins = ['http://localhost:3000'];
  const corsOrigins =
    envConfig.corsOrigin.length > 0 ? envConfig.corsOrigin : defaultCorsOrigins;

  app.enableCors({
    origin: corsOrigins,
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

  const port = process.env.PORT;

  if (!port) {
    throw new Error('PORT is not defined. Railway requires PORT env variable.');
  }

  await app.listen(port, '0.0.0.0');

  bootstrapLogger.log(
    `Listening 0.0.0.0:${port} — AuthModule: POST /api/auth/login (JwtAuthGuard no es global; login es público)`,
  );
  console.log('[HeyDoctor] PORT from ENV:', port);
  logExpressRouteStackIfEnabled(app);
}

bootstrap().catch((err: unknown) => {
  console.error('[HeyDoctor] Fatal startup error', err);
  process.exit(1);
});
