import {
  type AlertPayload,
  primStr,
  registerAlertSink,
  type AlertSink,
} from './alert.hooks';

const SLACK_TEXT_MAX = 3_500;

function formatSlackText(payload: AlertPayload): string {
  const levelRaw = payload.alertLevel;
  const level =
    typeof levelRaw === 'string' ? levelRaw.toUpperCase() : 'WARNING';
  const eventLabel = primStr(payload.event, 'alert');
  const headline = `🚨 *${level}*`;

  const rawIncident = payload.incident;
  const incident =
    rawIncident &&
    typeof rawIncident === 'object' &&
    rawIncident !== null &&
    !Array.isArray(rawIncident)
      ? (rawIncident as Record<string, unknown>)
      : null;

  let correlation = '';
  if (incident) {
    correlation =
      `\n🔁 Count: ${primStr(incident.count, '1')}\n` +
      `🕒 First: ${primStr(incident.firstSeenAt, '')}\n` +
      `🕒 Last: ${primStr(incident.lastSeenAt, '')}\n`;
  }

  const insightRaw = payload.analysis;
  const insight =
    typeof insightRaw === 'string' && insightRaw.length > 0
      ? `\n🧠 *Insight:* ${insightRaw}\n`
      : '';

  const rest: Record<string, unknown> = { ...payload };
  delete rest.alertLevel;
  delete rest.alertDedupeKey;
  delete rest.alertAt;
  delete rest.incident;
  delete rest.analysis;

  let body: string;
  try {
    body = JSON.stringify(rest, null, 2);
  } catch {
    body = '[payload no serializable]';
  }
  if (body.length > SLACK_TEXT_MAX) {
    body = `${body.slice(0, SLACK_TEXT_MAX)}…`;
  }
  return `${headline}\n*${eventLabel}*${insight}${correlation}\n\`\`\`json\n${body}\n\`\`\``;
}

/** Sink no bloqueante: fallos de red no afectan el request. */
export function createSlackWebhookSink(webhookUrl: string): AlertSink {
  return (payload: AlertPayload) => {
    void fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: formatSlackText(payload) }),
    }).catch(() => {
      /* intentionally empty */
    });
  };
}

/** Registra webhook de Slack si existe `SLACK_WEBHOOK_URL` (idempotente por URL). */
export function registerSlackWebhookFromEnv(): void {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) return;
  registerAlertSink(createSlackWebhookSink(url));
}
