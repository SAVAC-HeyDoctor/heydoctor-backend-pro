import { Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { getMetricsRedis } from '../common/redis/alert-redis.client';

const MAX_AGE_MS = 10 * 60 * 1000;
const MAX_SAMPLES = 25_000;
const CHART_BUCKETS = 30;

const NS = 'ops:v2';

type Sample = { t: number; path: string; status: number; ms: number };

function normalizePathForGrouping(path: string): string {
  let p = path.split('?')[0] ?? '/';
  p = p.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
    ':id',
  );
  if (!p.startsWith('/')) p = `/${p}`;
  return p.replace(/\/[0-9]+(?=\/|$)/g, '/:num');
}

/** Minuto UTC `YYYY-MM-DDTHH:mm` alineado entre réplicas. */
function minuteKeyUtc(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 16);
}

/** Ventana de 5 minutos (misma lógica en todos los pods). */
function fiveMinBucket(epochMs: number): number {
  return Math.floor(epochMs / (5 * 60 * 1000));
}

function pathField(path: string): string {
  return Buffer.from(path, 'utf8').toString('base64url');
}

function decodePathField(field: string): string {
  try {
    return Buffer.from(field, 'base64url').toString('utf8');
  } catch {
    return field;
  }
}

export type OpsHttpSnapshot = {
  requestsPerMinute: number;
  avgResponseTime: number;
  errorRate: number;
  requestsPerMinuteSeries: { minute: string; count: number }[];
  errorsByEndpoint: {
    path: string;
    errorCount: number;
    requestCount: number;
    errorRate: number;
  }[];
};

/**
 * RPM/latencia/error: Redis agregado si hay `REDIS_URL` y `OPS_METRICS_REDIS` no es `false`.
 * Siempre mantiene muestras en memoria como fallback ante fallo de Redis.
 */
@Injectable()
export class OpsHttpMetricsService {
  private samples: Sample[] = [];

  record(pathRaw: string, status: number, durationMs: number): void {
    const t = Date.now();
    const path = normalizePathForGrouping(pathRaw || '/');
    this.recordMemory(path, status, durationMs, t);
    void this.recordDistributed(path, status, durationMs).catch(() => {
      /* degradación silenciosa */
    });
  }

  private recordMemory(
    path: string,
    status: number,
    durationMs: number,
    t: number,
  ): void {
    this.samples.push({ t, path, status, ms: durationMs });
    const cutoff = t - MAX_AGE_MS;
    let i = 0;
    while (i < this.samples.length && this.samples[i].t < cutoff) {
      i++;
    }
    if (i > 0) {
      this.samples = this.samples.slice(i);
    }
    while (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }
  }

  private async recordDistributed(
    path: string,
    status: number,
    durationMs: number,
  ): Promise<void> {
    const redis = getMetricsRedis();
    if (!redis) {
      return;
    }
    const now = Date.now();
    const mk = minuteKeyUtc(now);
    const b5 = fiveMinBucket(now);
    const pf = pathField(path);
    const pipe = redis.pipeline();
    pipe.incr(`${NS}:rpm:${mk}`);
    pipe.expire(`${NS}:rpm:${mk}`, 120);
    pipe.lpush(`${NS}:lat:${mk}`, String(durationMs));
    pipe.ltrim(`${NS}:lat:${mk}`, 0, 999);
    pipe.expire(`${NS}:lat:${mk}`, 120);
    pipe.incr(`${NS}:gtot:${b5}`);
    pipe.expire(`${NS}:gtot:${b5}`, 360);
    if (status >= 500) {
      pipe.incr(`${NS}:gerr:${b5}`);
      pipe.expire(`${NS}:gerr:${b5}`, 360);
    }
    pipe.hincrby(`${NS}:ptot:${b5}`, pf, 1);
    pipe.expire(`${NS}:ptot:${b5}`, 360);
    if (status >= 500) {
      pipe.hincrby(`${NS}:perr:${b5}`, pf, 1);
      pipe.expire(`${NS}:perr:${b5}`, 360);
    }
    await pipe.exec();
  }

  async getSnapshot(): Promise<OpsHttpSnapshot> {
    const redis = getMetricsRedis();
    if (redis) {
      try {
        return await this.getSnapshotRedis(redis);
      } catch {
        return this.getSnapshotMemory();
      }
    }
    return this.getSnapshotMemory();
  }

  private async getSnapshotRedis(redis: Redis): Promise<OpsHttpSnapshot> {
    const now = Date.now();
    const mkPrev = minuteKeyUtc(now - 60_000);

    const [rpmStr, latVals, gtotStr, gerrStr] = await Promise.all([
      redis.get(`${NS}:rpm:${mkPrev}`),
      redis.lrange(`${NS}:lat:${mkPrev}`, 0, -1),
      redis.get(`${NS}:gtot:${fiveMinBucket(now)}`),
      redis.get(`${NS}:gerr:${fiveMinBucket(now)}`),
    ]);

    const requestsPerMinute = parseInt(rpmStr ?? '0', 10);
    const avgResponseTime =
      latVals.length > 0
        ? Math.round(
            latVals.reduce((a, s) => a + Number(s), 0) / latVals.length,
          )
        : 0;

    const tot = parseInt(gtotStr ?? '0', 10);
    const err = parseInt(gerrStr ?? '0', 10);
    const errorRate = tot > 0 ? err / tot : 0;

    const pipeSeries = redis.pipeline();
    const minuteKeys: string[] = [];
    for (let b = CHART_BUCKETS - 1; b >= 0; b--) {
      const t = now - b * 60_000;
      const mk = minuteKeyUtc(t);
      minuteKeys.push(mk);
      pipeSeries.get(`${NS}:rpm:${mk}`);
    }
    const seriesRes = await pipeSeries.exec();
    const requestsPerMinuteSeries = minuteKeys.map((mkFull, i) => {
      const row = seriesRes?.[i];
      const val = (row?.[1] as string | null) ?? null;
      const count = parseInt(val ?? '0', 10);
      return { minute: mkFull.slice(11, 16), count };
    });

    const b5 = fiveMinBucket(now);
    const [totH, errH] = await Promise.all([
      redis.hgetall(`${NS}:ptot:${b5}`),
      redis.hgetall(`${NS}:perr:${b5}`),
    ]);

    const fieldSet = new Set([
      ...Object.keys(totH ?? {}),
      ...Object.keys(errH ?? {}),
    ]);
    const errorsByEndpoint: OpsHttpSnapshot['errorsByEndpoint'] = [];
    for (const f of fieldSet) {
      const ec = parseInt(errH?.[f] ?? '0', 10);
      if (ec <= 0) continue;
      const tc = parseInt(totH?.[f] ?? '0', 10);
      errorsByEndpoint.push({
        path: decodePathField(f),
        errorCount: ec,
        requestCount: tc,
        errorRate: tc > 0 ? ec / tc : ec > 0 ? 1 : 0,
      });
    }
    errorsByEndpoint.sort((a, b) => b.errorCount - a.errorCount);
    const topErrors = errorsByEndpoint.slice(0, 25);

    return {
      requestsPerMinute,
      avgResponseTime,
      errorRate,
      requestsPerMinuteSeries,
      errorsByEndpoint: topErrors,
    };
  }

  private getSnapshotMemory(): OpsHttpSnapshot {
    const now = Date.now();
    const win1m = now - 60_000;
    const win5m = now - 5 * 60_000;
    const s1 = this.samples.filter((s) => s.t >= win1m);
    const s5 = this.samples.filter((s) => s.t >= win5m);

    const requestsPerMinute = s1.length;
    const avgResponseTime =
      s1.length > 0
        ? Math.round(s1.reduce((a, s) => a + s.ms, 0) / s1.length)
        : 0;
    const err5 = s5.filter((s) => s.status >= 500).length;
    const errorRate = s5.length > 0 ? err5 / s5.length : 0;

    const minuteMs = 60_000;
    const series: { minute: string; count: number }[] = [];
    for (let b = CHART_BUCKETS - 1; b >= 0; b--) {
      const bucketEnd = now - b * minuteMs;
      const bucketStart = bucketEnd - minuteMs;
      const label = new Date(bucketStart).toISOString().slice(11, 16);
      const count = this.samples.filter(
        (s) => s.t >= bucketStart && s.t < bucketEnd,
      ).length;
      series.push({ minute: label, count });
    }

    const byPath = new Map<string, { errors: number; total: number }>();
    for (const s of s5) {
      const cur = byPath.get(s.path) ?? { errors: 0, total: 0 };
      cur.total += 1;
      if (s.status >= 500) cur.errors += 1;
      byPath.set(s.path, cur);
    }

    const errorsByEndpoint = [...byPath.entries()]
      .filter(([, v]) => v.errors > 0)
      .map(([path, v]) => ({
        path,
        errorCount: v.errors,
        requestCount: v.total,
        errorRate: v.total > 0 ? v.errors / v.total : 0,
      }))
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 25);

    return {
      requestsPerMinute,
      avgResponseTime,
      errorRate,
      requestsPerMinuteSeries: series,
      errorsByEndpoint,
    };
  }

  /**
   * Media de latencia por path (~5 min, **muestras en esta instancia**).
   */
  getTopLatencyEndpoints(
    limit = 15,
  ): { path: string; avgMs: number; count: number }[] {
    const now = Date.now();
    const win5m = now - 5 * 60_000;
    const s5 = this.samples.filter((s) => s.t >= win5m);
    const byPath = new Map<string, { sum: number; n: number }>();
    for (const s of s5) {
      const cur = byPath.get(s.path) ?? { sum: 0, n: 0 };
      cur.sum += s.ms;
      cur.n += 1;
      byPath.set(s.path, cur);
    }
    return [...byPath.entries()]
      .map(([path, v]) => ({
        path,
        avgMs: Math.round(v.sum / v.n),
        count: v.n,
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, limit);
  }
}
