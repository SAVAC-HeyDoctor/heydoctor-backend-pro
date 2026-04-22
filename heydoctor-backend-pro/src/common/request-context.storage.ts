import { AsyncLocalStorage } from 'async_hooks';

type RequestContextStore = {
  requestId: string;
  /** Rellenado tras JWT (interceptor HTTP). */
  userId?: string;
  clinicId?: string | null;
};

const storage = new AsyncLocalStorage<RequestContextStore>();

/**
 * Binds correlation ID for the current request (call from RequestIdMiddleware).
 * Uses `enterWith` so async handlers (e.g. service `await`) still see the store.
 */
export function enterRequestContext(requestId: string): void {
  const prev = storage.getStore();
  storage.enterWith({
    requestId,
    userId: prev?.userId,
    clinicId: prev?.clinicId,
  });
}

/** Returns correlation ID for the active HTTP request, if any. */
export function getCurrentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function getCurrentUserIdForLog(): string | undefined {
  return storage.getStore()?.userId;
}

export function getCurrentClinicIdForLog(): string | null | undefined {
  return storage.getStore()?.clinicId;
}

/**
 * Tras guards JWT, enlaza usuario al contexto de logs (AsyncLocalStorage).
 */
export function mergeHttpLogContextFromUser(user: {
  sub: string;
  clinicId?: string | null;
}): void {
  const prev = storage.getStore();
  if (!prev || !user?.sub) {
    return;
  }
  storage.enterWith({
    requestId: prev.requestId,
    userId: user.sub,
    clinicId: user.clinicId ?? null,
  });
}
