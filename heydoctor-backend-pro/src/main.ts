import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { registerSlackWebhookFromEnv } from './common/alerts/slack-webhook.sink';
import { logExpressRouteStackIfEnabled } from './common/bootstrap/log-express-routes';
import { validateAndLogEnv } from './config/env-startup-check';
import { EnvConfig, ENV_CONFIG_TOKEN } from './config/env.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppModule } from './app.module';
import {
  assertRedisConfiguredForMultiInstanceProduction,
  productionReplicaCount,
} from './config/redis-requirement';
import type { Request, Response } from 'express';

const bootstrapLogger = new Logger('Bootstrap');

function isSwaggerEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_SWAGGER === 'true'
  );
}

function sanitizeDatabaseUrlForLog(raw?: string): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return '(not set)';
  try {
    const u = new URL(s.replace(/^postgresql:\/\//i, 'postgres://'));
    const port = u.port || (u.protocol === 'postgres:' ? '5432' : '');
    const hostPort = port ? `${u.hostname}:${port}` : u.hostname;
    const db = u.pathname.replace(/^\//, '') || '(defaultdb)';
    return `${u.protocol}//${hostPort}/${db}`;
  } catch {
    return '(unparseable)';
  }
}

/**
 * Producción: dominios explícitos (`credentials: true`, sin wildcard).
 * Desarrollo: añade `CORS_ORIGIN` y localhost.
 */
const PRODUCTION_CORS_ORIGINS: string[] = [
  'https://heydoctor.cl',
  'https://app.heydoctor.cl',
];

function configuredCorsOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsOriginList(): string[] {
  const envOrigins = configuredCorsOrigins();

  if (process.env.NODE_ENV === 'production') {
    return [...PRODUCTION_CORS_ORIGINS, ...envOrigins];
  }

  return [
    ...PRODUCTION_CORS_ORIGINS,
    ...envOrigins,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
}

async function bootstrap() {
  registerSlackWebhookFromEnv();

  bootstrapLogger.log('bootstrap_context', {
    NODE_ENV: process.env.NODE_ENV ?? 'undefined',
    DATABASE_URL_HINT: sanitizeDatabaseUrlForLog(process.env.DATABASE_URL),
    REDIS_URL_CONFIGURED: Boolean(process.env.REDIS_URL?.trim()),
    E2E_SEED_APPLIED: process.env.E2E_SEED_APPLIED ?? 'not reported',
  });

  console.log('ENV CHECK', {
    PRICING_PRO_CHECKOUT_AMOUNT_CLP:
      process.env.PRICING_PRO_CHECKOUT_AMOUNT_CLP,
    SUBSCRIPTION_PRO_MONTHLY_PRICE: process.env.SUBSCRIPTION_PRO_MONTHLY_PRICE,
    CONSULTATION_PAYMENT_AMOUNT_CLP:
      process.env.CONSULTATION_PAYMENT_AMOUNT_CLP,
    PAYKU_API_KEY_SET: Boolean(process.env.PAYKU_API_KEY?.trim()),
    NODE_ENV: process.env.NODE_ENV,
  });

  assertRedisConfiguredForMultiInstanceProduction();
  if (
    process.env.NODE_ENV === 'production' &&
    productionReplicaCount() === 1 &&
    !process.env.REDIS_URL?.trim()
  ) {
    bootstrapLogger.warn(
      'REDIS_URL is not set: throttling uses in-memory storage. Add Redis before scaling beyond one production instance.',
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  if (isSwaggerEnabled()) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('HeyDoctor API')
      .setDescription('HeyDoctor backend API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const documentFactory = () =>
      SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup('docs', app, documentFactory, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
    bootstrapLogger.log('Swagger UI enabled at /docs');
  } else {
    bootstrapLogger.log('Swagger UI disabled in production');
  }

  /** Railway/proxy: `X-Forwarded-Proto` → `req.secure`; cookies `Secure` no se descartan. */
  app.set('trust proxy', 1);

  const server = app.getHttpAdapter().getInstance();
  server.get('/_health', (_req: Request, res: Response) => {
    res.status(200).send('ok');
  });

  app.use(cookieParser());
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

  bootstrapLogger.log(`CORS origins: ${corsOriginList().join(', ')}`);

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
    exposedHeaders: ['Set-Cookie', 'X-Request-Id'],
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
