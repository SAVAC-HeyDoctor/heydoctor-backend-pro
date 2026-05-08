type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Rompe ráfagas de fallos hacia un servicio externo (p. ej. Payku).
 */
export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = 'CLOSED';
  private lastFailure = 0;

  constructor(
    private readonly threshold = 5,
    private readonly openTimeoutMs = 10_000,
  ) {}

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.openTimeoutMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker OPEN');
      }
    }

    try {
      const result = await fn();
      this.failures = 0;
      this.state = 'CLOSED';
      return result;
    } catch (err) {
      this.failures++;
      this.lastFailure = Date.now();
      if (this.failures >= this.threshold) {
        this.state = 'OPEN';
      }
      throw err;
    }
  }
}
