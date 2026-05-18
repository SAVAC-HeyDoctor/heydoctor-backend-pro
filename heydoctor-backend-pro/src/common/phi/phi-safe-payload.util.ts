const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BLOCKED_KEYS = new Set([
  'email',
  'name',
  'password',
  'passwordHash',
  'ip',
  'userAgent',
  'reason',
  'subject',
  'rawBody',
  'body',
  'headers',
]);

const ALLOWED_SCALAR_KEYS = new Set([
  'paymentId',
  'consultationId',
  'userId',
  'clinicId',
  'eventType',
  'type',
  'source',
  'incomingPaymentStatus',
  'action',
  'transactionId',
  'incomingStatus',
  'failureReason',
  'webhookAction',
  'previousPlan',
  'newPlan',
  'previousStatus',
  'newStatus',
]);

function isUuidLike(v: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(v);
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (BLOCKED_KEYS.has(key)) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.replace(EMAIL_RE, '[redacted]').slice(0, 256);
    if (key.endsWith('Id') || key === 'userId' || key === 'clinicId') {
      return isUuidLike(trimmed) ? trimmed : '[redacted-id]';
    }
    return trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value === null) return null;
  return undefined;
}

/** PHI-safe payload for admin diagnostics (IDs + enums only). */
export function sanitizeOutboxPayload(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_SCALAR_KEYS.has(key) && key !== 'metadata') continue;
    if (key === 'metadata' && value && typeof value === 'object') {
      const meta: Record<string, unknown> = {};
      for (const [mk, mv] of Object.entries(value as Record<string, unknown>)) {
        if (!ALLOWED_SCALAR_KEYS.has(mk)) continue;
        const sv = sanitizeValue(mk, mv);
        if (sv !== undefined) meta[mk] = sv;
      }
      if (Object.keys(meta).length > 0) out.metadata = meta;
      continue;
    }
    const sv = sanitizeValue(key, value);
    if (sv !== undefined) out[key] = sv;
  }
  return out;
}

export function sanitizeErrorMessage(raw: string): string {
  return raw.replace(EMAIL_RE, '[redacted]').slice(0, 480);
}
