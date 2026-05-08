import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEvent } from '../growth/product-event.entity';
import { SubscriptionsAnalyticsService } from '../subscriptions/subscriptions-analytics.service';
import { OpsAlertsRecentService } from './ops-alerts-recent.service';
import type { OpsOverviewDto } from './ops-overview.dto';
import { OpsHttpMetricsService } from './ops-http-metrics.service';

const ACTIVE_MINUTES = 15;

function distinctActorExpr(alias = 'e'): string {
  return `COALESCE(${alias}.user_id::text, ${alias}.properties->>'anonSessionId')`;
}

@Injectable()
export class OpsOverviewService {
  constructor(
    private readonly httpMetrics: OpsHttpMetricsService,
    private readonly opsAlerts: OpsAlertsRecentService,
    private readonly subscriptionsAnalytics: SubscriptionsAnalyticsService,
    @InjectRepository(ProductEvent)
    private readonly productEvents: Repository<ProductEvent>,
  ) {}

  async getOverview(): Promise<OpsOverviewDto> {
    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const [httpSnap, payStats, activeRow] = await Promise.all([
      this.httpMetrics.getSnapshot(),
      this.subscriptionsAnalytics.getPaymentSucceededStatsUtcDay(todayUtc),
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

    const activeUsers = Number(activeRow?.cnt ?? 0);
    const alertsLast24h = this.opsAlerts.countLast24h();
    const recent = this.opsAlerts.getRecent(40);

    return {
      uptime: Math.floor(process.uptime()),
      requestsPerMinute: httpSnap.requestsPerMinute,
      avgResponseTime: httpSnap.avgResponseTime,
      errorRate: httpSnap.errorRate,
      activeUsers,
      paymentsToday: payStats.paymentCount,
      revenueToday: payStats.revenueClp,
      alertsLast24h,
      requestsPerMinuteSeries: httpSnap.requestsPerMinuteSeries,
      errorsByEndpoint: httpSnap.errorsByEndpoint,
      recentAlerts: recent.map((e) => ({
        at: new Date(e.at).toISOString(),
        event: e.event,
        level: e.level,
        message: e.message,
      })),
    };
  }
}
