import { AsyncLocalStorage } from 'async_hooks';

type RequestContextStore = {
  requestId: string;
  /** Marca temporal al entrar al middleware (duración server-side). */
  startedAtMs: number;
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
  const startedAtMs = prev?.startedAtMs ?? Date.now();
  storage.enterWith({
    requestId,
    startedAtMs,
    userId: prev?.userId,
    clinicId: prev?.clinicId,
  });
}

/** Returns correlation ID for the active HTTP request, if any. */
export function getCurrentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Inicio del request en servidor (ms epoch), para span / duración ALS. */
export function getRequestStartedAtMs(): number | undefined {
  return storage.getStore()?.startedAtMs;
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
/** Ejecuta trabajo async con correlación (outbox worker, cron). */
export function runWithRequestContext<T>(requestId: string, fn: () => T): T {
  return storage.run(
    {
      requestId,
      startedAtMs: Date.now(),
    },
    fn,
  );
}

export async function runWithRequestContextAsync<T>(
  requestId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(
    {
      requestId,
      startedAtMs: Date.now(),
    },
    fn,
  );
}

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
    startedAtMs: prev.startedAtMs,
    userId: user.sub,
    clinicId: user.clinicId ?? null,
  });
}
