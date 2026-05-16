const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'access_token',
  'refresh_token',
  'token',
  'password',
  'secret',
  'sdp',
  'candidate',
  'icecandidate',
  'email',
  'patient',
  'patientname',
  'diagnosis',
  'prescription',
  'clinicalnote',
  'medicalhistory',
]);

const MAX_DEPTH = 5;
const MAX_STRING_LENGTH = 2_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Error)
  );
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, '');
  return SENSITIVE_KEYS.has(normalized) || SENSITIVE_KEYS.has(key.toLowerCase());
}

function sanitizeString(value: string): string {
  if (/^Bearer\s+/i.test(value)) return '[REDACTED]';
  if (/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/.test(value)) {
    return '[REDACTED]';
  }
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`
    : value;
}

export function sanitizeTelemetry(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (depth >= MAX_DEPTH) return '[MaxDepth]';
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTelemetry(item, depth + 1));
  }
  if (!isRecord(value)) return String(value);

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = isSensitiveKey(key)
      ? '[REDACTED]'
      : sanitizeTelemetry(child, depth + 1);
  }
  return out;
}
