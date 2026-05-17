import { productionReplicaCount } from '../../config/redis-requirement';

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

/** Metadatos de despliegue Railway / release (sin secretos ni PHI). */
export function getRailwayDeploymentDiagnostics(): Record<string, unknown> {
  const commitSha =
    env('SENTRY_RELEASE') ??
    env('RAILWAY_GIT_COMMIT_SHA') ??
    env('VERCEL_GIT_COMMIT_SHA');
  return {
    service: 'heydoctor-backend-pro',
    nodeEnv: env('NODE_ENV'),
    railwayEnvironment: env('RAILWAY_ENVIRONMENT'),
    railwayServiceId: env('RAILWAY_SERVICE_ID'),
    railwayServiceName: env('RAILWAY_SERVICE_NAME'),
    railwayProjectId: env('RAILWAY_PROJECT_ID'),
    railwayDeploymentId: env('RAILWAY_DEPLOYMENT_ID'),
    railwayReplicaId: env('RAILWAY_REPLICA_ID'),
    railwayReplicasConfigured: productionReplicaCount(),
    gitCommitSha: commitSha,
    gitCommitShortSha: commitSha ? commitSha.slice(0, 12) : null,
    sentryRelease: env('SENTRY_RELEASE'),
    redisConfigured: Boolean(env('REDIS_URL')),
    hostname: env('RAILWAY_STATIC_URL') ? '[set]' : null,
    uptimeSeconds: Math.floor(process.uptime()),
    checkedAt: new Date().toISOString(),
  };
}
