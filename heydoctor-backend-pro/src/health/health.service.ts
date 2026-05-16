import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { productionReplicaCount } from '../config/redis-requirement';
import { getSocketIoRedisHealth } from '../common/websocket/socket-io-health';

export type ReleaseMetadata = {
  service: string;
  version: string;
  environment: string | null;
  railwayEnvironment: string | null;
  release: string | null;
  commitSha: string | null;
  commitShortSha: string | null;
  startedAt: string;
  uptimeSeconds: number;
};

export type DependencyHealth = {
  status: 'ok' | 'degraded' | 'down';
  checkedAt: string;
  responseTimeMs?: number;
  details?: Record<string, unknown>;
};

export type ReadinessResponse = {
  ok: boolean;
  status: 'ready' | 'degraded' | 'not_ready';
  service: string;
  checkedAt: string;
  uptimeSeconds: number;
  release: ReleaseMetadata;
  dependencies: {
    database: DependencyHealth;
    socketIoRedis: DependencyHealth;
  };
};

const STARTED_AT = new Date();
const DB_CHECK_TIMEOUT_MS = 1_500;

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function shortSha(value: string | null): string | null {
  return value ? value.slice(0, 12) : null;
}

function packageVersion(): string {
  return env('npm_package_version') ?? '1.0.0';
}

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  liveness() {
    return {
      ok: true as const,
      status: 'alive' as const,
      service: 'heydoctor-backend-pro',
      uptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date().toISOString(),
    };
  }

  release(): ReleaseMetadata {
    const commitSha =
      env('SENTRY_RELEASE') ??
      env('RAILWAY_GIT_COMMIT_SHA') ??
      env('VERCEL_GIT_COMMIT_SHA') ??
      null;
    return {
      service: 'heydoctor-backend-pro',
      version: packageVersion(),
      environment: env('NODE_ENV'),
      railwayEnvironment: env('RAILWAY_ENVIRONMENT'),
      release: env('SENTRY_RELEASE') ?? commitSha,
      commitSha,
      commitShortSha: shortSha(commitSha),
      startedAt: STARTED_AT.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async readiness(): Promise<ReadinessResponse> {
    const [database, socketIoRedis] = await Promise.all([
      this.databaseHealth(),
      Promise.resolve(this.socketIoRedisHealth()),
    ]);

    const dependencyStatuses = [database.status, socketIoRedis.status];
    const status = dependencyStatuses.includes('down')
      ? 'not_ready'
      : dependencyStatuses.includes('degraded')
        ? 'degraded'
        : 'ready';

    return {
      ok: status !== 'not_ready',
      status,
      service: 'heydoctor-backend-pro',
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      release: this.release(),
      dependencies: {
        database,
        socketIoRedis,
      },
    };
  }

  private async databaseHealth(): Promise<DependencyHealth> {
    const started = Date.now();
    if (!this.dataSource.isInitialized) {
      return {
        status: 'down',
        checkedAt: new Date().toISOString(),
        details: { reason: 'not_initialized' },
      };
    }

    try {
      await this.queryDatabaseWithTimeout();
      return {
        status: 'ok',
        checkedAt: new Date().toISOString(),
        responseTimeMs: Date.now() - started,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      return {
        status: 'down',
        checkedAt: new Date().toISOString(),
        responseTimeMs: Date.now() - started,
        details: { reason: error.message },
      };
    }
  }

  private async queryDatabaseWithTimeout(): Promise<void> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('database health timeout')),
            DB_CHECK_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private socketIoRedisHealth(): DependencyHealth {
    const health = getSocketIoRedisHealth();
    const replicas = productionReplicaCount();
    const redisRequired = process.env.NODE_ENV === 'production' && replicas > 1;
    const down =
      redisRequired &&
      (health.adapter !== 'redis' ||
        health.status === 'unavailable' ||
        health.status === 'disabled');

    const status = down
      ? 'down'
      : health.status === 'ready'
        ? 'ok'
        : 'degraded';

    return {
      status,
      checkedAt: new Date().toISOString(),
      details: {
        adapter: health.adapter,
        status: health.status,
        redisConfigured: health.redisConfigured,
        replicas,
        redisRequired,
        lastEventAt: health.lastEventAt,
        lastError: health.lastError,
      },
    };
  }
}
