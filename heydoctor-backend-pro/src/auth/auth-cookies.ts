/** Nombres y opciones de cookies de sesión (compartido entre AuthController y JwtStrategy). */

import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** JWT access en `main.ts` coincide con `JwtModule` (15m). */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Dominio fijo producción: cookies visibles en app + pro-api (subdominios HeyDoctor). */
export const HEYDOCTOR_AUTH_COOKIE_DOMAIN = '.heydoctor.health';

/**
 * Lee entorno en cada llamada (no al importar el módulo).
 * `SameSite=None` + `Secure` + `Domain=.heydoctor.health` solo cuando cross-site aplica;
 * si Railway no marca `NODE_ENV=production`, seguimos activando cookies de API si el
 * host público es HeyDoctor (`BACKEND_PUBLIC_URL`) o si se fuerza con env.
 */
function computeCrossSite(): boolean {
  if (process.env.AUTH_CROSS_SITE_COOKIES === 'false') {
    return false;
  }
  if (process.env.AUTH_CROSS_SITE_COOKIES === 'true') {
    return true;
  }
  const backendPublic = process.env.BACKEND_PUBLIC_URL ?? '';
  if (/heydoctor\.health/i.test(backendPublic)) {
    return true;
  }
  return (
    process.env.NODE_ENV === 'production' ||
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.RAILWAY_ENVIRONMENT_NAME ||
    !!process.env.RAILWAY_PUBLIC_DOMAIN
  );
}

/** Cross-site (Vercel app. → Railway pro-api.): `SameSite=None` + `Secure` + `Domain`. */
export function useCrossSiteCookies(): boolean {
  return computeCrossSite();
}

/** @deprecated usar {@link useCrossSiteCookies} */
export function useCrossSiteSessionCookies(): boolean {
  return useCrossSiteCookies();
}

/**
 * `Domain` para cookies de sesión y CSRF en producción.
 * Por defecto `.heydoctor.health` (sin inferencia desde URLs).
 * `AUTH_COOKIE_DOMAIN=none` desactiva Domain (solo pruebas / entornos raros).
 */
export function getAuthCookieDomain(): string | undefined {
  if (!computeCrossSite()) {
    return undefined;
  }
  const explicit = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (explicit && /^(none|false|0)$/i.test(explicit)) {
    return undefined;
  }
  if (explicit) {
    return explicit.startsWith('.') ? explicit : `.${explicit}`;
  }
  return HEYDOCTOR_AUTH_COOKIE_DOMAIN;
}

/**
 * Opciones HttpOnly para `access_token` y `refresh_token`.
 * Siempre invocar al setear cookies (no cachear en constante de módulo).
 */
/**
 * Opciones para `access_token` / `refresh_token` (HttpOnly).
 * Producción cross-subdomain: Domain=.heydoctor.health, SameSite=None, Secure, Path=/.
 */
export function getSessionCookieOptions(): CookieOptions {
  if (computeCrossSite()) {
    const domain = getAuthCookieDomain();
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      ...(domain ? { domain } : {}),
    };
  }
  return {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
  };
}

/** `secure` + `sameSite` para cookie CSRF (no HttpOnly). */
export function sessionCookieSameSitePolicy(): Pick<
  CookieOptions,
  'secure' | 'sameSite'
> {
  if (computeCrossSite()) {
    return { secure: true, sameSite: 'none' };
  }
  return { secure: false, sameSite: 'lax' };
}

export const SESSION_COOKIE_PATH = '/';

export type AuthCookieBaseOptions = Pick<
  CookieOptions,
  'httpOnly' | 'secure' | 'sameSite' | 'path'
>;

export function authCookieBase(
  path: string = SESSION_COOKIE_PATH,
): CookieOptions {
  return {
    ...getSessionCookieOptions(),
    path,
  };
}
