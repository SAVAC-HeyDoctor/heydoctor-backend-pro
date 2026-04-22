/** Nombres y opciones de cookies de sesión (compartido entre AuthController y JwtStrategy). */

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** JWT access en `main.ts` coincide con `JwtModule` (15m). */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type AuthCookieBaseOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'none' | 'lax';
  path: string;
};

export function authCookieBase(path: string): AuthCookieBaseOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path,
  };
}
