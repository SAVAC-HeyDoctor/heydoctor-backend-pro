import { AsyncLocalStorage } from 'async_hooks';

type RequestContextStore = {
  requestId: string;
};

const storage = new AsyncLocalStorage<RequestContextStore>();

/**
 * Binds correlation ID for the current request (call from RequestIdMiddleware).
 * Uses `enterWith` so async handlers (e.g. service `await`) still see the store.
 */
export function enterRequestContext(requestId: string): void {
  storage.enterWith({ requestId });
}

/** Returns correlation ID for the active HTTP request, if any. */
export function getCurrentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
