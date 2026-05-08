import Redis from 'ioredis';

let sharedClient: Redis | null | undefined;

function createClient(): Redis | null {
  const raw = process.env.REDIS_URL;
  const url =
    typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
  return url
    ? new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
      })
    : null;
}

/**
 * Conexión Redis compartida (`REDIS_URL`). Usada por alertas, incidentes y métricas ops.
 */
export function getSharedRedis(): Redis | null {
  if (sharedClient !== undefined) {
    return sharedClient;
  }
  sharedClient = createClient();
  return sharedClient;
}

/**
 * Correlación de incidentes: desactivable con `INCIDENT_CORRELATION_REDIS=false`.
 */
export function getAlertRedis(): Redis | null {
  if (process.env.INCIDENT_CORRELATION_REDIS === 'false') {
    return null;
  }
  return getSharedRedis();
}

/**
 * Métricas OPS distribuidas: desactivable con `OPS_METRICS_REDIS=false`.
 */
export function getMetricsRedis(): Redis | null {
  if (process.env.OPS_METRICS_REDIS === 'false') {
    return null;
  }
  return getSharedRedis();
}

/** Para tests / reinicio en el mismo proceso. */
export function resetAlertRedisClientForTests(): void {
  try {
    sharedClient?.disconnect();
  } catch {
    /* empty */
  }
  sharedClient = undefined;
}
