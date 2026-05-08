import { Injectable } from '@nestjs/common';

const MAX_AGE_MS = 10 * 60 * 1000;
const MAX_SAMPLES = 25_000;
const CHART_BUCKETS = 30;

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

/**
 * Muestras HTTP en memoria (por instancia). Usado para rpm, latencia y tasa de error.
 */
@Injectable()
export class OpsHttpMetricsService {
  private samples: Sample[] = [];

  record(pathRaw: string, status: number, durationMs: number): void {
    const t = Date.now();
    const path = normalizePathForGrouping(pathRaw || '/');
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

  getSnapshot(): {
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
  } {
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
}
