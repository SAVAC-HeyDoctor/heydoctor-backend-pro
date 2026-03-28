const UUID_SEGMENT =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

/**
 * Normalizes URL path for mapping (replaces UUID path segments with `/:id`).
 */
export function normalizeAuditPath(rawUrl: string): string {
  const pathOnly = rawUrl.split('?')[0];
  return pathOnly.replace(UUID_SEGMENT, '/:id');
}

export type AuditActionDescriptor = {
  action: string;
  resource: string;
};

const ROUTE_MAP: Record<string, AuditActionDescriptor> = {
  'GET /api/health': { action: 'HEALTH_CHECK', resource: 'health' },
  'POST /api/auth/register': { action: 'AUTH_REGISTER', resource: 'auth' },
  'POST /api/auth/login': { action: 'AUTH_LOGIN', resource: 'auth' },
  'POST /api/auth/refresh': { action: 'AUTH_REFRESH', resource: 'auth' },
  'POST /api/auth/logout': { action: 'AUTH_LOGOUT', resource: 'auth' },
  'GET /api/auth/me': { action: 'AUTH_ME', resource: 'auth' },
  'GET /api/patients': { action: 'PATIENT_LIST', resource: 'patient' },
  'POST /api/patients': { action: 'PATIENT_CREATE', resource: 'patient' },
  'GET /api/subscriptions': {
    action: 'SUBSCRIPTIONS_LIST',
    resource: 'subscription',
  },
  'PATCH /api/subscriptions/:id': {
    action: 'SUBSCRIPTION_UPDATE_PLAN',
    resource: 'subscription',
  },
  'GET /api/consultations': { action: 'CONSULTATION_LIST', resource: 'consultation' },
  'POST /api/consultations': { action: 'CONSULTATION_CREATE', resource: 'consultation' },
  'GET /api/consultations/:id': { action: 'CONSULTATION_READ', resource: 'consultation' },
  'GET /api/consultations/:id/ai': {
    action: 'CONSULTATION_AI_READ',
    resource: 'consultation',
  },
  'PATCH /api/consultations/:id': {
    action: 'CONSULTATION_UPDATE',
    resource: 'consultation',
  },
  'POST /api/consultations/:id/sign': {
    action: 'CONSULTATION_SIGNED',
    resource: 'consultation',
  },
  'DELETE /api/consultations/:id': {
    action: 'CONSULTATION_DELETE',
    resource: 'consultation',
  },
  'GET /api/audit/export': { action: 'AUDIT_EXPORT', resource: 'audit' },
  'GET /api/legal/export': {
    action: 'LEGAL_CONSULTATIONS_EXPORT',
    resource: 'legal',
  },
  'GET /api/legal/consultation/:id/pdf': {
    action: 'LEGAL_CONSULTATION_PDF_EXPORT',
    resource: 'legal',
  },
  'POST /api/consultations/:id/start-call': {
    action: 'CONSULTATION_CALL_STARTED',
    resource: 'consultation',
  },
  'POST /api/payku/create-payment-session': {
    action: 'PAYMENT_SESSION_CREATED',
    resource: 'payment',
  },
  'POST /api/payku/webhook': {
    action: 'PAYKU_WEBHOOK_RECEIVED',
    resource: 'payment',
  },
  'GET /api/metrics/rolling': {
    action: 'METRICS_ROLLING_READ',
    resource: 'metrics',
  },
  'POST /api/ai/consultation-summary': {
    action: 'AI_CONSULTATION_SUMMARY',
    resource: 'ai',
  },
};

const FALLBACK_RESOURCE = 'unknown';

export function resolveAuditAction(
  method: string,
  normalizedPath: string,
): AuditActionDescriptor {
  const key = `${method.toUpperCase()} ${normalizedPath}`;
  return (
    ROUTE_MAP[key] ?? {
      action: `${method.toUpperCase()}_${normalizedPath.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')}`,
      resource: FALLBACK_RESOURCE,
    }
  );
}
