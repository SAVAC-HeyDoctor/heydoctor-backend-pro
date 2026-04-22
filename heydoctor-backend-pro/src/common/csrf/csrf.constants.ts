/** Double-submit: cookie legible por JS + misma valor en cabecera (no HttpOnly). */

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

/** Mutaciones que no exigen CSRF (bootstrap de sesión o webhooks firmados). */
export const CSRF_SKIP_PATH_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/payku/webhook',
] as const;
