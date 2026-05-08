import { CircuitBreaker } from './circuit-breaker';

describe('CircuitBreaker', () => {
  it('opens after threshold consecutive failures then recovers after half-open success', async () => {
    const breaker = new CircuitBreaker(3, 50);
    const err = new Error('upstream down');

    await expect(breaker.exec(async () => Promise.reject(err))).rejects.toThrow(
      'upstream down',
    );
    await expect(breaker.exec(async () => Promise.reject(err))).rejects.toThrow(
      'upstream down',
    );
    await expect(breaker.exec(async () => Promise.reject(err))).rejects.toThrow(
      'upstream down',
    );

    await expect(breaker.exec(async () => 1)).rejects.toThrow(
      'Circuit breaker OPEN',
    );

    await new Promise((r) => setTimeout(r, 55));

    await expect(breaker.exec(async () => 42)).resolves.toBe(42);
  });
});
