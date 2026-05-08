import { getAlertRedis } from '../redis/alert-redis.client';
import { trackIncidentRedis } from './incident.store.redis';
import {
  type Incident,
  trackIncident as trackIncidentMemory,
} from './incident.store';

/**
 * Usa Redis si hay `REDIS_URL` (salvo `INCIDENT_CORRELATION_REDIS=false`).
 * Ante fallo de Redis, hace fallback a memoria local (degraded single-instance).
 */
export async function trackIncidentAsync(dedupeKey: string): Promise<Incident> {
  if (process.env.INCIDENT_CORRELATION_REDIS === 'false') {
    return trackIncidentMemory(dedupeKey);
  }
  const redis = getAlertRedis();
  if (!redis) {
    return trackIncidentMemory(dedupeKey);
  }
  try {
    return await trackIncidentRedis(dedupeKey, redis);
  } catch {
    return trackIncidentMemory(dedupeKey);
  }
}
