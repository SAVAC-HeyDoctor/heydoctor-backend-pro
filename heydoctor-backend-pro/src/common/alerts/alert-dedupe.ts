/**
 * Dedupe en memoria + tope global por minuto (por instancia de proceso).
 * En múltiples réplicas de Railway cada una tiene su caché (aceptable para reducir ruido).
 */

const dedupeLastAt = new Map<string, number>();
const sendsInRollingMinute: number[] = [];

export function getMaxAlertsPerMinuteFromEnv(): number {
  const raw = process.env.ALERT_MAX_PER_MINUTE?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 10;
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function pruneOlderThan(timestamps: number[], cutoffMs: number): void {
  while (timestamps.length > 0 && timestamps[0] < cutoffMs) {
    timestamps.shift();
  }
}

/**
 * Reserva envío: ventana fija 60s + TTL por clave.
 * @returns true si debe enviarse el sink; si false, no actualiza dedupe ni contador global.
 */
export function tryAcquireAlertSlot(dedupeKey: string, ttlMs: number): boolean {
  const now = Date.now();
  const prev = dedupeLastAt.get(dedupeKey);
  if (prev !== undefined && now - prev < ttlMs) {
    return false;
  }

  const maxPerMinute = getMaxAlertsPerMinuteFromEnv();
  pruneOlderThan(sendsInRollingMinute, now - 60_000);
  if (sendsInRollingMinute.length >= maxPerMinute) {
    return false;
  }

  dedupeLastAt.set(dedupeKey, now);
  sendsInRollingMinute.push(now);

  if (dedupeLastAt.size > 10_000) {
    const cut = now - Math.max(ttlMs, 3600_000);
    for (const [k, t] of dedupeLastAt) {
      if (t < cut) dedupeLastAt.delete(k);
    }
  }

  return true;
}

/** Tests / hot-reload local. */
export function clearAlertDedupeStateForTests(): void {
  dedupeLastAt.clear();
  sendsInRollingMinute.length = 0;
}
