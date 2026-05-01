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
 * Cualquier preview/despliegue en Vercel (*.vercel.app) con credenciales.
 * Producción propia: `https://heydoctor.health` (y fallbacks en resolveCorsOrigins).
 */
const VERCEL_APP_PATTERN = /^https:\/\/.*\.vercel\.app$/i;

/** Orígenes permitidos cuando CORS_ORIGIN no está definido (p. ej. Railway sin variable). */
function resolveCorsOrigins(envConfig: EnvConfig): string[] {
  if (envConfig.corsOrigin.length > 0) {
    return envConfig.corsOrigin;
  }
  const fallbacks = [
    'http://localhost:3000',
    'https://heydoctor-frontend.vercel.app',
    'https://heydoctor.vercel.app',
    'https://heydoctor.health',
    'https://app.heydoctor.health',
    'https://www.heydoctor.health',
    envConfig.frontendUrl,
  ];
  return [...new Set(fallbacks.filter(Boolean))];
}

/**
 * Builds a {@link import('cors').CorsOptions} `origin` callback that admits:
 *   - same-origin / non-browser requests (no Origin header).
 *   - exact matches in the allow-list (CORS_ORIGIN env or fallbacks).
 *   - operator-supplied regex patterns (CORS_ORIGIN_REGEX env, csv).
 *   - Vercel preview URLs of the heydoctor-frontend project.
 *
 * Anything else is rejected so credentials never leak to a third-party origin.
 */
function buildCorsOriginCallback(
  allowList: string[],
  regexList: RegExp[],
  logger: Logger,
): (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
) => void {
  const exact = new Set(allowList);
  const patterns: RegExp[] = [...regexList, VERCEL_APP_PATTERN];

  return (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    if (exact.has(origin)) {
      cb(null, true);
      return;
    }
    if (patterns.some((rx) => rx.test(origin))) {
      cb(null, true);
      return;
    }
    logger.warn(`CORS rejected origin: ${origin}`);
    cb(new Error(`Origin not allowed by CORS: ${origin}`));
  };
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

  // Orígenes con credenciales: si CORS_ORIGIN está vacío, incluir Vercel + FRONTEND_URL.
  const corsOrigins = resolveCorsOrigins(envConfig);
  const corsRegex = envConfig.corsOriginRegex;
  bootstrapLogger.log(
    `CORS allowed origins (${corsOrigins.length}): ${corsOrigins.join(', ')}` +
      (corsRegex.length > 0
        ? ` | regex: ${corsRegex.map((r) => r.source).join(', ')}`
        : ''),
  );

  app.enableCors({
    origin: buildCorsOriginCallback(corsOrigins, corsRegex, bootstrapLogger),
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
