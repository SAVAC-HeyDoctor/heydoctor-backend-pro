import { Injectable } from '@nestjs/common';
import * as os from 'os';
import { OpsHttpMetricsService } from './ops-http-metrics.service';

export type OpsScalingDto = {
  /** Media de carga del SO (Unix `loadavg[0]`); 0 en entornos sin soporte. */
  cpuLoad: number;
  requestsPerMinute: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
};

@Injectable()
export class OpsScalingService {
  constructor(private readonly http: OpsHttpMetricsService) {}

  async getScaling(): Promise<OpsScalingDto> {
    const snap = await this.http.getSnapshot();
    const load = os.loadavg();
    const cpuLoad =
      Array.isArray(load) && typeof load[0] === 'number' && Number.isFinite(load[0])
        ? Math.round(load[0] * 1000) / 1000
        : 0;

    return {
      cpuLoad,
      requestsPerMinute: snap.requestsPerMinute,
      avgResponseTime: snap.avgResponseTime,
      p95ResponseTime: snap.p95ResponseTime,
      p99ResponseTime: snap.p99ResponseTime,
      errorRate: snap.errorRate,
    };
  }
}
