import { randomBytes } from 'crypto';
import type { CookieOptions, Response } from 'express';
import { sessionCookieSameSitePolicy } from '../../auth/auth-cookies';
import { CSRF_COOKIE } from './csrf.constants';

const CSRF_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function csrfCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    ...sessionCookieSameSitePolicy(),
    path: '/',
    maxAge: CSRF_MAX_AGE_MS,
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
  res.clearCookie(CSRF_COOKIE, {
    ...sessionCookieSameSitePolicy(),
    path: '/',
  });
}
