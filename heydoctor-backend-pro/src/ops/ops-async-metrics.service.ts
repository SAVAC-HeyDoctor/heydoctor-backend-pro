import { Injectable } from '@nestjs/common';
import { getMetricsRedis } from '../common/redis/alert-redis.client';

const WINDOW_MS = 5 * 60 * 1000;
const NS = 'ops:async:v1';

type CounterWindow = {
  enqueued: number;
  processed: number;
  retryAttempts: number;
  failedRetries: number;
  deadLetters: number;
  processingLatencyMs: number[];
};

@Injectable()
export class OpsAsyncMetricsService {
  private window: CounterWindow = this.emptyWindow();
  private windowStartedAt = Date.now();

  private emptyWindow(): CounterWindow {
    return {
      enqueued: 0,
      processed: 0,
      retryAttempts: 0,
      failedRetries: 0,
      deadLetters: 0,
      processingLatencyMs: [],
    };
  }

  private rollWindowIfNeeded(): void {
    if (Date.now() - this.windowStartedAt < WINDOW_MS) return;
    this.window = this.emptyWindow();
    this.windowStartedAt = Date.now();
  }

  recordEnqueued(): void {
    this.rollWindowIfNeeded();
    this.window.enqueued += 1;
    void this.incrRedis('enqueued').catch(() => undefined);
  }

  recordRetryAttempt(): void {
    this.rollWindowIfNeeded();
    this.window.retryAttempts += 1;
    void this.incrRedis('retry').catch(() => undefined);
  }

  recordFailedRetry(): void {
    this.rollWindowIfNeeded();
    this.window.failedRetries += 1;
    void this.incrRedis('failed_retry').catch(() => undefined);
  }

  recordDeadLetter(): void {
    this.rollWindowIfNeeded();
    this.window.deadLetters += 1;
    void this.incrRedis('dead_letter').catch(() => undefined);
  }

  recordProcessed(latencyMs: number): void {
    this.rollWindowIfNeeded();
    this.window.processed += 1;
    if (this.window.processingLatencyMs.length < 500) {
      this.window.processingLatencyMs.push(latencyMs);
    }
    void this.incrRedis('processed').catch(() => undefined);
  }

  recordWebhookFailure(): void {
    void this.incrRedis('webhook_fail').catch(() => undefined);
  }

  getSnapshot(): {
    retryRate: number;
    deadLetterRate: number;
    eventProcessingLatencyMs: number;
  } {
    this.rollWindowIfNeeded();
    const attempts = this.window.retryAttempts;
    const total = attempts + this.window.processed + this.window.deadLetters;
    const lat = this.window.processingLatencyMs;
    return {
      retryRate: total > 0 ? attempts / total : 0,
      deadLetterRate: total > 0 ? this.window.deadLetters / total : 0,
      eventProcessingLatencyMs:
        lat.length > 0
          ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)
          : 0,
    };
  }

  async getDistributedSnapshot(): Promise<{
    retryRate: number;
    deadLetterRate: number;
    webhookFailureRate: number;
  }> {
    const redis = getMetricsRedis();
    if (!redis) {
      const local = this.getSnapshot();
      return { ...local, webhookFailureRate: 0 };
    }
    const bucket = Math.floor(Date.now() / WINDOW_MS);
    const key = (suffix: string) => `${NS}:${bucket}:${suffix}`;
    const [retry, processed, dead, webhookFail] = await Promise.all([
      redis.get(key('retry')),
      redis.get(key('processed')),
      redis.get(key('dead_letter')),
      redis.get(key('webhook_fail')),
    ]);
    const r = Number(retry ?? 0);
    const p = Number(processed ?? 0);
    const d = Number(dead ?? 0);
    const w = Number(webhookFail ?? 0);
    const total = r + p + d;
    return {
      retryRate: total > 0 ? r / total : 0,
      deadLetterRate: total > 0 ? d / total : 0,
      webhookFailureRate: w + p > 0 ? w / (w + p) : 0,
    };
  }

  private async incrRedis(field: string): Promise<void> {
    const redis = getMetricsRedis();
    if (!redis) return;
    const bucket = Math.floor(Date.now() / WINDOW_MS);
    const k = `${NS}:${bucket}:${field}`;
    await redis.incr(k);
    await redis.pexpire(k, WINDOW_MS + 60_000);
  }
}
