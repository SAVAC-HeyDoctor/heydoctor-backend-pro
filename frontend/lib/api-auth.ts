/**
 * Auth contra el backend Nest: sesión en cookies HttpOnly (access + refresh).
 * El cliente usa credentials: 'include'; no guardar tokens en localStorage.
 */

import { apiFetch, getApiBase, jsonHeaders } from './api-client';
import { parseApiErrorResponse } from './api-error';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  clinicId?: string | null;
}

/** Respuesta alineada con Nest: usuario en JSON; tokens solo en cookies HttpOnly. */
export interface LoginResponse {
  user: AuthUser;
}

/**
 * POST /api/auth/login — Set-Cookie: access_token, refresh_token
 */
export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const base = getApiBase();
  const res = await apiFetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(credentials),
  });

  if (!res.ok) {
    throw await parseApiErrorResponse(res);
  }

  return res.json() as Promise<LoginResponse>;
}

export async function logout(): Promise<void> {
  const base = getApiBase();
  await apiFetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({}),
  });
}

export async function refreshSession(): Promise<void> {
  const base = getApiBase();
  const res = await apiFetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw await parseApiErrorResponse(res);
  }
}
