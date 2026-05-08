/**
 * Tope global de alertas por minuto (por instancia).
 * Correlación por incidente: {@link ./incident.store}.
 */

const sendsInRollingMinute: number[] = [];

export function getMaxAlertsPerMinuteFromEnv(): number {
  const raw = process.env.ALERT_MAX_PER_MINUTE?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 10;
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function pruneOlderThan(timestamps: number[], cutoffMs: number): void {
  while (timestamps.length > 0) {
    const head = timestamps[0];
    if (head === undefined || head >= cutoffMs) break;
    timestamps.shift();
  }
}

/** Tope global / minuto para el primer evento de un incidente que sí notifica. */
export function tryAcquireGlobalAlertBudget(): boolean {
  const now = Date.now();
  const maxPerMinute = getMaxAlertsPerMinuteFromEnv();
  pruneOlderThan(sendsInRollingMinute, now - 60_000);
  if (sendsInRollingMinute.length >= maxPerMinute) {
    return false;
  }
  sendsInRollingMinute.push(now);
  return true;
}

/** Tests / hot-reload local. */
export function clearAlertDedupeStateForTests(): void {
  sendsInRollingMinute.length = 0;
}
