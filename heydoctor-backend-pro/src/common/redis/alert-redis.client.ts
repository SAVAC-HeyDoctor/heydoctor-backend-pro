import Redis from 'ioredis';

let client: Redis | null | undefined;

/**
 * Cliente Redis dedicado a correlación de incidentes (alertas).
 * Comparte `REDIS_URL` con caché/throttle; lazy init.
 */
export function getAlertRedis(): Redis | null {
  if (client !== undefined) {
    return client;
  }
  if (process.env.INCIDENT_CORRELATION_REDIS === 'false') {
    client = null;
    return client;
  }
  const url = process.env.REDIS_URL?.trim();
  client = url
    ? new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
      })
    : null;
  return client;
}

/** Para tests / reinicio en el mismo proceso. */
export function resetAlertRedisClientForTests(): void {
  try {
    client?.disconnect();
  } catch {
    /* empty */
  }
  client = undefined;
}
