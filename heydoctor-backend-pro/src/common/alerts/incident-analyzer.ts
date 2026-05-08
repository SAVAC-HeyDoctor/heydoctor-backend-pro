import type { AlertPayload } from './alert.hooks';

function str(v: unknown, fb: string): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fb;
}

/**
 * Heurística para texto de inspección en Slack / panel (no sustituye RCA).
 */
export function analyzeIncident(payload: AlertPayload): string {
  const key = str(payload.alertDedupeKey, '');
  const ev = str(payload.event, '');
  const path = str(payload.path, '');
  const code = str(payload.code, '');

  const haystack = `${key} ${ev} ${path} ${code}`.toLowerCase();

  if (haystack.includes('payment') || haystack.includes('payku')) {
    return 'Posible incidente en el proveedor de pagos (Payku) o en el flujo de checkout.';
  }
  if (haystack.includes('500') || haystack.includes('server_error')) {
    return 'Pico de errores internos (5xx); revisar despliegue, DB y dependencias externas.';
  }
  if (haystack.includes('webhook')) {
    return 'Fallo o rechazo en webhook; revisar firma, red y formato del cuerpo.';
  }
  if (ev === 'ops_error_spike' || haystack.includes('error')) {
    return 'Anomalía de errores u operaciones; contrastar con métricas y trazas recientes.';
  }
  if (ev === 'ops_latency_high') {
    return 'Latencia elevada; posible saturación o dependencia lenta.';
  }
  if (ev === 'ops_traffic_drop') {
    return 'Caída de tráfico respecto al baseline; revisar CDN, DNS y salud del frontend.';
  }
  return 'Anomalía sin clasificación automática; revisar detalle del payload y logs.';
}
