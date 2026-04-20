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
  'GET /': { action: 'HEALTH_CHECK', resource: 'health' },
  'GET /health': { action: 'HEALTH_CHECK', resource: 'health' },
  'GET /healthz': { action: 'HEALTH_CHECK', resource: 'health' },
  'GET /api/health': { action: 'HEALTH_CHECK', resource: 'health' },
  'POST /api/auth/register': { action: 'AUTH_REGISTER', resource: 'auth' },
  'POST /api/auth/login': { action: 'AUTH_LOGIN', resource: 'auth' },
  'POST /api/auth/refresh': { action: 'AUTH_REFRESH', resource: 'auth' },
  'POST /api/auth/logout': { action: 'AUTH_LOGOUT', resource: 'auth' },
  'GET /api/auth/me': { action: 'AUTH_ME', resource: 'auth' },
  'PATCH /api/auth/change-password': {
    action: 'AUTH_CHANGE_PASSWORD',
    resource: 'auth',
  },
  'GET /api/patients': { action: 'PATIENT_LIST', resource: 'patient' },
  'POST /api/patients': { action: 'PATIENT_CREATE', resource: 'patient' },
  'POST /api/appointments': {
    action: 'APPOINTMENT_CREATED',
    resource: 'appointment',
  },
  'GET /api/appointments/confirm/:id': {
    action: 'APPOINTMENT_CONFIRM_PUBLIC',
    resource: 'appointment',
  },
  'GET /api/appointments/cancel/:id': {
    action: 'APPOINTMENT_CANCEL_PUBLIC',
    resource: 'appointment',
  },
  'GET /appointments/confirm/:id': {
    action: 'APPOINTMENT_CONFIRM_PUBLIC',
    resource: 'appointment',
  },
  'GET /appointments/cancel/:id': {
    action: 'APPOINTMENT_CANCEL_PUBLIC',
    resource: 'appointment',
  },
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
  'GET /api/consultations/consultation-price': {
    action: 'CONSULTATION_PRICE_READ',
    resource: 'consultation',
  },
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
  'POST /api/doctor-applications': {
    action: 'DOCTOR_APPLICATION_CREATED',
    resource: 'doctor_application',
  },
  'GET /api/doctor-applications': {
    action: 'DOCTOR_APPLICATIONS_LIST',
    resource: 'doctor_application',
  },
  'PATCH /api/doctor-applications/:id/review': {
    action: 'DOCTOR_APPLICATION_REVIEWED',
    resource: 'doctor_application',
  },
  'GET /api/doctors': {
    action: 'DOCTORS_LIST',
    resource: 'doctor_profile',
  },
  'GET /api/doctors/:id': {
    action: 'DOCTOR_PROFILE_READ',
    resource: 'doctor_profile',
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
  'GET /api/consents/telemedicine/status': {
    action: 'CONSENT_STATUS_CHECK',
    resource: 'consent',
  },
  'POST /api/consents/telemedicine': {
    action: 'CONSENT_TELEMEDICINE_ACCEPTED',
    resource: 'consent',
  },
  'GET /api/gdpr/export': {
    action: 'GDPR_DATA_EXPORT',
    resource: 'user',
  },
  'DELETE /api/gdpr/delete-my-data': {
    action: 'GDPR_DELETION_REQUEST',
    resource: 'user',
  },
  'POST /api/gdpr/confirm-deletion': {
    action: 'GDPR_DELETION_CONFIRMED',
    resource: 'user',
  },
  'GET /api/gdpr/deletion-status': {
    action: 'GDPR_DELETION_STATUS',
    resource: 'user',
  },
  'PHI_ACCESS': {
    action: 'PHI_ACCESS',
    resource: 'phi',
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
