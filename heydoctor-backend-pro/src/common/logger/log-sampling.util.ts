/**
 * Optional sampling for very high-frequency log lines (e.g. per-request diagnostics).
 * Not used by default — avoids surprise data loss in production.
 *
 * When enabling at a call site, pick a stable rate in (0, 1], e.g. 0.2 = ~20% of events.
 *
 * @example
 * ```typescript
 * import { shouldEmitSampledLog } from './log-sampling.util';
 * // if (shouldEmitSampledLog(0.2)) {
 * //   this.logger.log('High frequency event', { ...context });
 * // }
 * ```
 */
export function shouldEmitSampledLog(sampleRate: number): boolean {
  if (sampleRate >= 1) {
    return true;
  }
  if (sampleRate <= 0) {
    return false;
  }
  return Math.random() < sampleRate;
}
