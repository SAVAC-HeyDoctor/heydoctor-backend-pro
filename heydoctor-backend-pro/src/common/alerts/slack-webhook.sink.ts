import {
  registerAlertSink,
  type AlertPayload,
  type AlertSink,
} from './alert.hooks';

const SLACK_TEXT_MAX = 3_500;

function formatSlackText(payload: AlertPayload): string {
  let body: string;
  try {
    body = JSON.stringify(payload, null, 2);
  } catch {
    body = String(payload);
  }
  if (body.length > SLACK_TEXT_MAX) {
    body = `${body.slice(0, SLACK_TEXT_MAX)}…`;
  }
  return `HeyDoctor alert\n\`\`\`json\n${body}\n\`\`\``;
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
