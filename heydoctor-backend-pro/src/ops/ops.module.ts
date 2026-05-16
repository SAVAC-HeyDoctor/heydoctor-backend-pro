import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ProductEvent } from '../growth/product-event.entity';
import { AdminOpsController } from './admin-ops.controller';
import { OpsAlertsRecentService } from './ops-alerts-recent.service';
import { OpsAnomalyScheduler } from './ops-anomaly.scheduler';
import { OpsDataReliabilityService } from './ops-data-reliability.service';
import { OpsHttpMetricsService } from './ops-http-metrics.service';
import { OpsMetricsInterceptor } from './ops-metrics.interceptor';
import { OpsOverviewService } from './ops-overview.service';
import { OpsScalingService } from './ops-scaling.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductEvent]), SubscriptionsModule],
  controllers: [AdminOpsController],
  providers: [
    OpsHttpMetricsService,
    OpsAlertsRecentService,
    OpsScalingService,
    OpsDataReliabilityService,
    OpsAnomalyScheduler,
    OpsOverviewService,
    OpsMetricsInterceptor,
    { provide: APP_INTERCEPTOR, useExisting: OpsMetricsInterceptor },
  ],
  exports: [OpsHttpMetricsService, OpsMetricsInterceptor],
})
export class OpsModule {}
