/** Nombres y opciones de cookies de sesión (compartido entre AuthController y JwtStrategy). */

import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** JWT access en `main.ts` coincide con `JwtModule` (15m). */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Mismo registrable (`heydoctor.health`): `app.*` ↔ `api.*` comparten cookies con
 * `Domain=.heydoctor.health` + `Secure` + `SameSite=None` (políticas modernas Chrome).
 *
 * Sobrescribe con `AUTH_COOKIE_DOMAIN=.tudominio.com` / `AUTH_COOKIE_DOMAIN=none` en edge cases.
 */
export const HEYDOCTOR_COOKIE_DOMAIN = '.heydoctor.health';

/**
 * Producción / Railway / hostname HeyDoctor.
 * Requiere `app.set('trust proxy', 1)` para `Secure` con proxy HTTPS.
 */
const isProd =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  (process.env.BACKEND_PUBLIC_URL ?? '').includes('heydoctor.health');

const PROD_SESSION_COOKIE_OPTIONS: Omit<CookieOptions, 'domain'> = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
};

const DEV_SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: false,
  sameSite: 'lax',
  path: '/',
};

/** `Domain` compartido (solo prod); debe coincidir con clearCookie opciones. */
export function getAuthCookieDomain(): string | undefined {
  if (!isProd) {
    return undefined;
  }
  const explicit = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (explicit && /^(none|false|0)$/i.test(explicit)) {
    return undefined;
  }
  if (explicit) {
    return explicit.startsWith('.') ? explicit : `.${explicit}`;
  }
  return HEYDOCTOR_COOKIE_DOMAIN;
}

/** Cookies de sesión bajo mismo eTLD+1 (p. ej. app.heydoctor.health + api.heydoctor.health). */
export function useCrossSiteCookies(): boolean {
  return isProd;
}

/** @deprecated usar {@link useCrossSiteCookies} */
export function useCrossSiteSessionCookies(): boolean {
  return useCrossSiteCookies();
}

/** `access_token` y `refresh_token`. */
export function getSessionCookieOptions(): CookieOptions {
  if (!isProd) {
    return { ...DEV_SESSION_COOKIE_OPTIONS };
  }
  const domain = getAuthCookieDomain();
  return {
    ...PROD_SESSION_COOKIE_OPTIONS,
    ...(domain ? { domain } : {}),
  };
}

/**
 * Cookie CSRF (no HttpOnly; token también en JSON + cabecera).
 * Misma política Secure / SameSite / Domain que la sesión en prod.
 */
export function sessionCookieSameSitePolicy(): Pick<
  CookieOptions,
  'secure' | 'sameSite'
> {
  return isProd
    ? { secure: true, sameSite: 'none' }
    : { secure: false, sameSite: 'lax' };
}

export const SESSION_COOKIE_PATH = '/';

export type AuthCookieBaseOptions = Pick<
  CookieOptions,
  'httpOnly' | 'secure' | 'sameSite' | 'path' | 'domain'
>;

export function authCookieBase(
  path: string = SESSION_COOKIE_PATH,
): CookieOptions {
  return {
    ...getSessionCookieOptions(),
    path,
  };
}
