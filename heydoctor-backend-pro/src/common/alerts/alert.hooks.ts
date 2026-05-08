/**
 * Hooks para alertas operativas (Slack, Sentry, Datadog…).
 * Dedupe + tope global/min en {@link tryAcquireAlertSlot}.
 */

import {
  clearAlertDedupeStateForTests,
  tryAcquireAlertSlot,
} from './alert-dedupe';

export type AlertPayload = Record<string, unknown>;

export type AlertLevel = 'info' | 'warning' | 'critical';

export type AlertSink = (payload: AlertPayload) => void;

export type NotifyAlertOptions = {
  /** Clave estable para dedupe (misma incidencia no spam). */
  key?: string;
  ttlMs?: number;
  level?: AlertLevel;
};

const sinks: AlertSink[] = [];

/** Serializa campos `unknown` para claves de dedupe / Slack. */
export function primStr(v: unknown, fallback: string): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
}

function inferAlertLevel(payload: AlertPayload): AlertLevel {
  const sev = payload.severity;
  if (sev === 'critical') return 'critical';
  if (sev === 'warning') return 'warning';
  const ev = payload.event;
  if (ev === 'server_error') return 'critical';
  if (ev === 'payku_webhook_auth_failed') return 'critical';
  if (payload.alert === 'subscription_payment_failed') return 'critical';
  if (ev === 'growth_business_alert') return 'warning';
  return 'warning';
}

function defaultDedupeKey(payload: AlertPayload, level: AlertLevel): string {
  const ev = primStr(payload.event, 'unknown');
  if (ev === 'server_error') {
    return `${ev}:${primStr(payload.method, '')}:${truncate(primStr(payload.path, ''), 200)}`;
  }
  if (payload.alert === 'subscription_payment_failed') {
    const pid = typeof payload.paymentId === 'string' ? payload.paymentId : '';
    return `payment_failed:${primStr(payload.userId, '')}:${pid || 'na'}`;
  }
  if (ev === 'payku_webhook_auth_failed') {
    return 'payku_webhook_auth';
  }
  if (ev === 'growth_business_alert') {
    return `growth:${primStr(payload.code, 'na')}:${level}`;
  }
  return `${ev}:${level}`;
}

function defaultTtlMs(
  payload: AlertPayload,
  level: AlertLevel,
  explicit?: number,
): number {
  if (explicit !== undefined) return explicit;
  if (primStr(payload.event, '') === 'growth_business_alert') {
    return 86_400_000;
  }
  switch (level) {
    case 'critical':
      return 45_000;
    case 'warning':
      return 90_000;
    case 'info':
    default:
      return 120_000;
  }
}

/** Registra un sink (p. ej. una vez en main.ts). Idempotente si el mismo ref se pasa dos veces. */
export function registerAlertSink(sink: AlertSink): void {
  if (!sinks.includes(sink)) {
    sinks.push(sink);
  }
}

/** Para tests: vacía sinks y estado de dedupe. */
export function clearAlertSinksForTests(): void {
  sinks.length = 0;
  clearAlertDedupeStateForTests();
}

/**
 * Notificación no bloqueante; errores en sinks se ignoran para no romper el request.
 */
export function notifyAlert(
  payload: AlertPayload,
  options?: NotifyAlertOptions,
): void {
  const level = options?.level ?? inferAlertLevel(payload);
  const dedupeKey = options?.key ?? defaultDedupeKey(payload, level);
  const ttlMs = defaultTtlMs(payload, level, options?.ttlMs);

  if (!tryAcquireAlertSlot(dedupeKey, ttlMs)) {
    return;
  }

  const enriched: AlertPayload = {
    ...payload,
    alertLevel: level,
    alertDedupeKey: dedupeKey,
    alertAt: new Date().toISOString(),
  };

  for (const sink of sinks) {
    try {
      sink(enriched);
    } catch {
      /* intentionally empty */
    }
  }
}
