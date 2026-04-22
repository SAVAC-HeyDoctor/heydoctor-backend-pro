/**
 * Hooks para alertas operativas (Sentry, Datadog, PagerDuty, etc.).
 * Por defecto no hace nada; registrar sinks en bootstrap si se integra un proveedor.
 */

export type AlertPayload = Record<string, unknown>;

export type AlertSink = (payload: AlertPayload) => void;

const sinks: AlertSink[] = [];

/** Registra un sink (p. ej. una vez en main.ts). Idempotente si el mismo ref se pasa dos veces. */
export function registerAlertSink(sink: AlertSink): void {
  if (!sinks.includes(sink)) {
    sinks.push(sink);
  }
}

/** Para tests o hot-reload: vacía sinks registrados. */
export function clearAlertSinksForTests(): void {
  sinks.length = 0;
}

/**
 * Notificación no bloqueante; errores en sinks se ignoran para no romper el request.
 */
export function notifyAlert(payload: AlertPayload): void {
  for (const sink of sinks) {
    try {
      sink(payload);
    } catch {
      /* intentionally empty */
    }
  }
}
