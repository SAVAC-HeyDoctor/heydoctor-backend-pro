/**
 * Hooks para alertas: correlación por incidente + tope global/min.
 */

import {
  clearAlertDedupeStateForTests,
  tryAcquireGlobalAlertBudget,
} from './alert-dedupe';
import { clearIncidentStoreForTests } from './incident.store';
import { trackIncidentAsync } from './incident.store.distributed';
import { analyzeIncident } from './incident-analyzer';
import { resetAlertRedisClientForTests } from '../redis/alert-redis.client';

export type AlertPayload = Record<string, unknown>;

export type AlertLevel = 'info' | 'warning' | 'critical';

export type AlertSink = (payload: AlertPayload) => void;

export type NotifyAlertOptions = {
  key?: string;
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
  if (ev === 'revenue_drop' || ev === 'no_payments_detected') return 'critical';
  if (ev === 'ops_error_spike') return 'critical';
  if (ev === 'conversion_drop') return 'warning';
  if (ev === 'growth_business_alert') return 'warning';
  if (
    ev === 'ops_latency_high' ||
    ev === 'ops_traffic_drop' ||
    ev === 'latency_spike'
  )
    return 'warning';
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
  if (ev === 'revenue_drop') {
    return `revenue_drop:${primStr(payload.lastClosedMonth, 'na')}`;
  }
  if (ev === 'no_payments_detected') {
    return `no_payments:${primStr(payload.dayUtc, 'na')}`;
  }
  if (ev === 'conversion_drop') {
    return 'conversion_drop:signup_to_paid';
  }
  if (ev === 'latency_spike') {
    return 'latency_spike:p95';
  }
  return `${ev}:${level}`;
}

/** Registra un sink (p. ej. una vez en main.ts). Idempotente si el mismo ref se pasa dos veces. */
export function registerAlertSink(sink: AlertSink): void {
  if (!sinks.includes(sink)) {
    sinks.push(sink);
  }
}

/** Para tests: vacía sinks, presupuesto global e incidentes. */
export function clearAlertSinksForTests(): void {
  sinks.length = 0;
  clearAlertDedupeStateForTests();
  clearIncidentStoreForTests();
  resetAlertRedisClientForTests();
}

/**
 * Notificación no bloqueante; errores en sinks se ignoran para no romper el request.
 * Con `REDIS_URL`, la correlación de incidentes es **distribuida** (un solo aviso global por clave).
 */
export function notifyAlert(
  payload: AlertPayload,
  options?: NotifyAlertOptions,
): void {
  void dispatchNotifyAlert(payload, options).catch(() => {
    /* intentionally empty */
  });
}

async function dispatchNotifyAlert(
  payload: AlertPayload,
  options?: NotifyAlertOptions,
): Promise<void> {
  const level = options?.level ?? inferAlertLevel(payload);
  const dedupeKey = options?.key ?? defaultDedupeKey(payload, level);

  const incident = await trackIncidentAsync(dedupeKey);
  if (incident.count > 1) {
    return;
  }

  if (!tryAcquireGlobalAlertBudget()) {
    return;
  }

  const enriched: AlertPayload = {
    ...payload,
    alertLevel: level,
    alertDedupeKey: dedupeKey,
    alertAt: new Date().toISOString(),
    incident: {
      key: incident.key,
      count: incident.count,
      firstSeenAt: new Date(incident.firstSeenAt).toISOString(),
      lastSeenAt: new Date(incident.lastSeenAt).toISOString(),
    },
    analysis: analyzeIncident({
      ...payload,
      alertDedupeKey: dedupeKey,
    }),
  };

  for (const sink of sinks) {
    try {
      sink(enriched);
    } catch {
      /* intentionally empty */
    }
  }
}
