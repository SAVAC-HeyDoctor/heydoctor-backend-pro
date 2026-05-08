/**
 * Reintentos con backoff lineal (Payku y otros clientes externos).
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; delayMs?: number } = {},
): Promise<T> {
  const { retries = 3, delayMs = 300 } = options;
  let lastError: unknown;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }

  throw lastError;
}
