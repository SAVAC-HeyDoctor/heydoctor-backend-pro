import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as os from 'os';
import { Repository } from 'typeorm';
import { ProductEvent } from '../growth/product-event.entity';
import { OpsHttpMetricsService } from './ops-http-metrics.service';

const ACTIVE_MINUTES = 15;

export type OpsScalingDto = {
  /** Media de carga del SO (Unix `loadavg[0]`); 0 en entornos sin soporte. */
  cpuLoad: number;
  requestsPerMinute: number;
  avgResponseTime: number;
  p95Latency: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  activeUsers: number;
};

function distinctActorExpr(alias = 'e'): string {
  return `COALESCE(${alias}.user_id::text, ${alias}.properties->>'anonSessionId')`;
}

@Injectable()
export class OpsScalingService {
  constructor(
    private readonly http: OpsHttpMetricsService,
    @InjectRepository(ProductEvent)
    private readonly productEvents: Repository<ProductEvent>,
  ) {}

  async getScaling(): Promise<OpsScalingDto> {
    const [snap, activeRow] = await Promise.all([
      this.http.getSnapshot(),
      this.productEvents
        .createQueryBuilder('e')
        .select(`COUNT(DISTINCT (${distinctActorExpr('e')}))`, 'cnt')
        .where('e.created_at > :since', {
          since: new Date(Date.now() - ACTIVE_MINUTES * 60_000),
        })
        .andWhere(
          "(e.user_id IS NOT NULL OR (e.properties->>'anonSessionId') IS NOT NULL)",
        )
        .getRawOne<{ cnt: string }>(),
    ]);
    const load = os.loadavg();
    const cpuLoad =
      Array.isArray(load) &&
      typeof load[0] === 'number' &&
      Number.isFinite(load[0])
        ? Math.round(load[0] * 1000) / 1000
        : 0;

    return {
      cpuLoad,
      requestsPerMinute: snap.requestsPerMinute,
      avgResponseTime: snap.avgResponseTime,
      p95Latency: snap.p95ResponseTime,
      p95ResponseTime: snap.p95ResponseTime,
      p99ResponseTime: snap.p99ResponseTime,
      errorRate: snap.errorRate,
      activeUsers: Number(activeRow?.cnt ?? 0),
    };
  }
}
