import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { validateAndLogEnv } from './config/env-startup-check';
import { EnvConfig, ENV_CONFIG_TOKEN } from './config/env.config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(cookieParser());
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalGuards(app.get(ThrottlerGuard));
  app.use(new RequestIdMiddleware().use);

  const config = app.get(ConfigService);
  const envConfig = app.get<EnvConfig>(ENV_CONFIG_TOKEN);
  const missingVars = validateAndLogEnv(envConfig);
  if (missingVars.length > 0 && envConfig.isProduction) {
    throw new Error(
      `Missing required env vars in production: ${missingVars.join(', ')}`,
    );
  }

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: envConfig.corsOrigin.length > 0 ? envConfig.corsOrigin : true,
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

  await app.listen(envConfig.port);
  console.log(`[HeyDoctor] Listening on port ${envConfig.port} (${envConfig.nodeEnv})`);
}
void bootstrap();
