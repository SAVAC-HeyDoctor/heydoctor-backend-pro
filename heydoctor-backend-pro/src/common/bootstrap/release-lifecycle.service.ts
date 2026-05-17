import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { captureMessage } from '../observability/sentry';

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

@Injectable()
export class ReleaseLifecycleService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ReleaseLifecycleService.name);

  constructor(private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): void {
    const payload = {
      event: 'application_bootstrap_complete',
      nodeEnv: env('NODE_ENV'),
      railwayEnvironment: env('RAILWAY_ENVIRONMENT'),
      release: env('SENTRY_RELEASE') ?? env('RAILWAY_GIT_COMMIT_SHA'),
      databaseInitialized: this.dataSource.isInitialized,
      redisConfigured: Boolean(env('REDIS_URL')),
    };
    this.logger.log('application_bootstrap_complete', payload);
    captureMessage('application_bootstrap_complete', 'info', payload);
  }

  onApplicationShutdown(signal?: string): void {
    const payload = {
      event: 'application_shutdown',
      signal: signal ?? null,
      uptimeSeconds: Math.floor(process.uptime()),
      databaseInitialized: this.dataSource.isInitialized,
    };
    this.logger.warn('application_shutdown', payload);
    captureMessage('application_shutdown', 'warning', payload);
  }
}
