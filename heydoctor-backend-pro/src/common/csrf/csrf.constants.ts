/** Double-submit: cookie legible por JS + misma valor en cabecera (no HttpOnly). */

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Mutaciones que no exigen CSRF (bootstrap de sesión, webhooks firmados o
 * endpoints públicos sin sesión, p. ej. `/api/public/consultations` para
 * pacientes guest que llegan desde home/WhatsApp/QR).
 */
export const CSRF_SKIP_PATH_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/payku/webhook',
  '/api/public',
] as const;
