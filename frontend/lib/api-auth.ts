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

/** Respuesta alineada con Nest: solo `user` en JSON; nunca depender de tokens en el cuerpo. */
export interface LoginResponse {
  user: AuthUser;
}

function parseLoginResponseBody(raw: unknown): LoginResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid login response');
  }
  const o = raw as Record<string, unknown>;
  const user = o.user;
  if (!user || typeof user !== 'object') {
    throw new Error('Invalid login response: missing user');
  }
  return { user: user as AuthUser };
}

/**
 * POST /api/auth/login — Set-Cookie HttpOnly; no usar `access_token` del JSON aunque exista.
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

  const raw: unknown = await res.json();
  return parseLoginResponseBody(raw);
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
