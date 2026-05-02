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

/**
 * Producción: `app.heydoctor.health` + previews Vercel (`credentials: true`, sin `*`).
 * Desarrollo: añade marketing, `CORS_ORIGIN` y localhost.
 */
const PRODUCTION_CORS_ORIGINS: (string | RegExp)[] = [
  'https://app.heydoctor.health',
  /^https:\/\/.*\.vercel\.app$/i,
];

function corsOriginList(): (string | RegExp)[] {
  if (process.env.NODE_ENV === 'production') {
    return PRODUCTION_CORS_ORIGINS;
  }

  const envOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return [
    ...PRODUCTION_CORS_ORIGINS,
    'https://heydoctor.health',
    'https://www.heydoctor.health',
    ...envOrigins,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
}

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL?.trim()) {
    bootstrapLogger.warn(
      'REDIS_URL is not set: throttling uses in-memory storage per instance (not shared across replicas). Add Redis for distributed rate limits in multi-instance production.',
    );
  }

  const app = await NestFactory.create(AppModule, { rawBody: true });

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

  bootstrapLogger.log(
    `CORS origins: ${corsOriginList()
      .map((o) => (o instanceof RegExp ? o.source : o))
      .join(', ')}`,
  );

  app.enableCors({
    origin: corsOriginList(),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cookie',
      'X-Requested-With',
      'X-CSRF-Token',
    ],
    exposedHeaders: ['Set-Cookie'],
  });

  app.use(
    (
      _req: unknown,
      res: { setHeader: (k: string, v: string) => void },
      next: () => void,
    ) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader(
        'Permissions-Policy',
        'camera=(self), microphone=(self), geolocation=()',
      );
      next();
    },
  );

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
  bootstrapLogger.log(
    `bootstrap_listening | ${JSON.stringify({ event: 'listening', port, host: '0.0.0.0' })}`,
  );
  logExpressRouteStackIfEnabled(app);
}

bootstrap().catch((err: unknown) => {
  console.error('[HeyDoctor] Fatal startup error', err);
  process.exit(1);
});
