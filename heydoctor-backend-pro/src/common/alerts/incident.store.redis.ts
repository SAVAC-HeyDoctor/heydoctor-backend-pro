import { createHash } from 'crypto';
import type Redis from 'ioredis';
import type { Incident } from './incident.store';
import { getIncidentIdleTtlMs } from './incident.store';

function storageId(dedupeKey: string): string {
  return createHash('sha256').update(dedupeKey, 'utf8').digest('hex');
}

/**
 * Correlación global: `INCR` compartido entre réplicas → solo `count === 1` notifica.
 * TTL alineado con {@link getIncidentIdleTtlMs} (sliding: cada hit renueva ventana).
 */
export async function trackIncidentRedis(
  dedupeKey: string,
  redis: Redis,
): Promise<Incident> {
  const id = storageId(dedupeKey);
  const prefix = `incident:v1:${id}`;
  const cntKey = `${prefix}:count`;
  const firstKey = `${prefix}:firstSeenAt`;
  const lastKey = `${prefix}:lastSeenAt`;
  const ttlSec = Math.max(1, Math.ceil(getIncidentIdleTtlMs() / 1000));
  const now = Date.now();

  const count = await redis.incr(cntKey);
  await redis.expire(cntKey, ttlSec);

  if (count === 1) {
    await redis.set(firstKey, String(now), 'EX', ttlSec);
  } else {
    await redis.expire(firstKey, ttlSec).catch(() => {
      /* key puede no existir en carrera; ignorar */
    });
  }

  await redis.set(lastKey, String(now), 'EX', ttlSec);

  const [firstStr] = await redis.mget(firstKey, lastKey);
  const firstSeenAt = firstStr ? Number(firstStr) : now;

  return {
    key: dedupeKey,
    firstSeenAt,
    lastSeenAt: now,
    count,
  };
}
