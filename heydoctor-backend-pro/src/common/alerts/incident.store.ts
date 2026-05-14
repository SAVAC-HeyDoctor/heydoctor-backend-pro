/**
 * Correlación de alertas: mismo `key` → un incidente con conteo y ventana temporal.
 * Tras INCIDENT_IDLE_TTL_MS sin nuevos hits, el incidente se descarta (opcional ping Slack).
 */

export type Incident = {
  key: string;
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
};

const incidents = new Map<string, Incident>();

export function getIncidentIdleTtlMs(): number {
  const raw = process.env.INCIDENT_IDLE_TTL_MS?.trim();
  if (!raw) return 5 * 60 * 1000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 5 * 60 * 1000;
}

export function trackIncident(key: string): Incident {
  startCleanupLoopIfNeeded();
  const now = Date.now();
  const existing = incidents.get(key);
  if (existing) {
    existing.lastSeenAt = now;
    existing.count += 1;
    return { ...existing };
  }
  const incident: Incident = {
    key,
    firstSeenAt: now,
    lastSeenAt: now,
    count: 1,
  };
  incidents.set(key, incident);
  return { ...incident };
}

let cleanupInterval: ReturnType<typeof setInterval> | undefined;

function startCleanupLoopIfNeeded(): void {
  if (cleanupInterval !== undefined) return;
  cleanupInterval = setInterval(runIncidentCleanup, 60_000);
  cleanupInterval.unref();
}

function runIncidentCleanup(): void {
  const now = Date.now();
  const ttl = getIncidentIdleTtlMs();
  const resolutionSlack =
    process.env.ALERT_INCIDENT_RESOLUTION_SLACK === 'true';

  for (const [key, inc] of incidents) {
    if (now - inc.lastSeenAt <= ttl) continue;
    incidents.delete(key);
    if (resolutionSlack && inc.count > 1) {
      void sendIncidentResolvedSlack(key, inc);
    }
  }

  if (incidents.size > 5000) {
    for (const [key, inc] of incidents) {
      if (now - inc.lastSeenAt > ttl * 2) incidents.delete(key);
    }
  }
}

function sendIncidentResolvedSlack(key: string, inc: Incident): void {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) return;
  const durationMs = inc.lastSeenAt - inc.firstSeenAt;
  const text =
    `✅ *Incident quiet*\n` +
    `\`${key}\`\n` +
    `🔁 Total events: ${inc.count}\n` +
    `⏱ Window: ${durationMs}ms\n` +
    `🕒 First: ${new Date(inc.firstSeenAt).toISOString()}\n` +
    `🕒 Last: ${new Date(inc.lastSeenAt).toISOString()}`;
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch(() => {
    /* empty */
  });
}

export function clearIncidentStoreForTests(): void {
  incidents.clear();
}
