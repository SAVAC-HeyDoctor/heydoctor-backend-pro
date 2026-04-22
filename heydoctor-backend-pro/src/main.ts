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

/** Orígenes permitidos cuando CORS_ORIGIN no está definido (p. ej. Railway sin variable). */
function resolveCorsOrigins(envConfig: EnvConfig): string[] {
  if (envConfig.corsOrigin.length > 0) {
    return envConfig.corsOrigin;
  }
  const fallbacks = [
    'http://localhost:3000',
    'https://heydoctor-frontend.vercel.app',
    'https://heydoctor.vercel.app',
    envConfig.frontendUrl,
  ];
  return [...new Set(fallbacks.filter(Boolean))];
}

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
  /** Throttler global; JWT + clínica vía APP_GUARD en AppModule; rutas públicas con @Public(). */
  app.useGlobalGuards(app.get(ThrottlerGuard));

  const envConfig = app.get<EnvConfig>(ENV_CONFIG_TOKEN);
  const missingVars = validateAndLogEnv(envConfig);
  if (missingVars.length > 0 && envConfig.isProduction) {
    throw new Error(
      `Missing required env vars in production: ${missingVars.join(', ')}`,
    );
  }

  // Orígenes con credenciales: si CORS_ORIGIN está vacío, incluir Vercel + FRONTEND_URL.
  const corsOrigins = resolveCorsOrigins(envConfig);
  bootstrapLogger.log(`CORS allowed origins (${corsOrigins.length}): ${corsOrigins.join(', ')}`);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
    exposedHeaders: ['Set-Cookie'],
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
    `Listening 0.0.0.0:${port} — JWT global + ClinicGuard; login/register con @Public()`,
  );
  console.log('[HeyDoctor] PORT from ENV:', port);
  logExpressRouteStackIfEnabled(app);
}

bootstrap().catch((err: unknown) => {
  console.error('[HeyDoctor] Fatal startup error', err);
  process.exit(1);
});
