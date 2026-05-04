import { randomBytes } from 'crypto';
import type { CookieOptions, Response } from 'express';
import {
  getAuthCookieDomain,
  sessionCookieSameSitePolicy,
} from '../../auth/auth-cookies';
import { CSRF_COOKIE } from './csrf.constants';

const CSRF_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * CSRF: no HttpOnly (el cliente SPA usa el token en JSON + `X-CSRF-Token` en cross-origin).
 * Misma política `secure`/`sameSite`/`domain` que las cookies de sesión en prod.
 */
export function csrfCookieOptions(): CookieOptions {
  const domain = getAuthCookieDomain();
  return {
    httpOnly: false,
    ...sessionCookieSameSitePolicy(),
    path: '/',
    maxAge: CSRF_MAX_AGE_MS,
    ...(domain ? { domain } : {}),
  };
}

export function createCsrfSecret(): string {
  return randomBytes(32).toString('hex');
}

export function setCsrfCookie(res: Response, token?: string): string {
  const value = token ?? createCsrfSecret();
  res.cookie(CSRF_COOKIE, value, csrfCookieOptions());
  return value;
}

export function clearCsrfCookie(res: Response): void {
  const domain = getAuthCookieDomain();
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    ...sessionCookieSameSitePolicy(),
    path: '/',
    ...(domain ? { domain } : {}),
  });
}
