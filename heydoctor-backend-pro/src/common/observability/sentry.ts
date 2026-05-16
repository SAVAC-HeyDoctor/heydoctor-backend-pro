import * as Sentry from '@sentry/node';
import type { ErrorEvent, SeverityLevel } from '@sentry/node';
import {
  getCurrentClinicIdForLog,
  getCurrentRequestId,
  getCurrentUserIdForLog,
} from '../request-context.storage';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'access_token',
  'refresh_token',
  'token',
  'password',
  'secret',
  'credential',
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

let initialized = false;

function sentryDsn(): string | undefined {
  const dsn = process.env.SENTRY_DSN?.trim();
  return dsn && dsn.length > 0 ? dsn : undefined;
}

function tracesSampleRate(): number {
  const raw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 1) {
    return raw;
  }
  return process.env.NODE_ENV === 'production' ? 0.1 : 1;
}

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
  return (
    SENSITIVE_KEYS.has(normalized) || SENSITIVE_KEYS.has(key.toLowerCase())
  );
}

function sanitizeString(value: string): string {
  if (/^Bearer\s+/i.test(value)) {
    return '[REDACTED]';
  }
  if (/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/.test(value)) {
    return '[REDACTED]';
  }
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`
    : value;
}

export function sanitizeTelemetry(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (depth >= MAX_DEPTH) {
    return '[MaxDepth]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTelemetry(item, depth + 1));
  }
  if (!isRecord(value)) {
    return Object.prototype.toString.call(value);
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = isSensitiveKey(key)
      ? '[REDACTED]'
      : sanitizeTelemetry(child, depth + 1);
  }
  return out;
}

export function initSentry(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  const dsn = sentryDsn();
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ??
      process.env.RAILWAY_ENVIRONMENT ??
      process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE ?? process.env.RAILWAY_GIT_COMMIT_SHA,
    tracesSampleRate: tracesSampleRate(),
    beforeSend(event: ErrorEvent): ErrorEvent {
      return sanitizeTelemetry(event) as ErrorEvent;
    },
  });
}

export function sentryEnabled(): boolean {
  return initialized && Boolean(sentryDsn());
}

function withDefaultContext(
  context?: Record<string, unknown>,
): Record<string, unknown> {
  const requestId = getCurrentRequestId();
  const userId = getCurrentUserIdForLog();
  const clinicId = getCurrentClinicIdForLog();
  return {
    ...(context ?? {}),
    ...(requestId ? { requestId, traceId: requestId } : {}),
    ...(userId ? { userId } : {}),
    ...(clinicId ? { clinicId } : {}),
  };
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentryEnabled()) {
    return;
  }
  const safeContext = sanitizeTelemetry(withDefaultContext(context)) as Record<
    string,
    unknown
  >;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(safeContext)) {
      scope.setExtra(key, value);
    }
    Sentry.captureException(error);
  });
}

export function captureMessage(
  message: string,
  level: SeverityLevel = 'info',
  context?: Record<string, unknown>,
): void {
  if (!sentryEnabled()) {
    return;
  }
  const safeContext = sanitizeTelemetry(withDefaultContext(context)) as Record<
    string,
    unknown
  >;
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    for (const [key, value] of Object.entries(safeContext)) {
      scope.setExtra(key, value);
    }
    Sentry.captureMessage(message);
  });
}

export function addSentryBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!sentryEnabled()) {
    return;
  }
  Sentry.addBreadcrumb({
    category,
    message,
    level: 'info',
    data: sanitizeTelemetry(withDefaultContext(data)) as Record<
      string,
      unknown
    >,
  });
}
