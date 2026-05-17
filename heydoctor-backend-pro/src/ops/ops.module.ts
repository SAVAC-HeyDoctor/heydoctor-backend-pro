import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductEvent } from '../growth/product-event.entity';
import { EventOutbox } from '../outbox/event-outbox.entity';
import { PaykuPayment } from '../payku/payku-payment.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminOpsController } from './admin-ops.controller';
import { OpsAlertsRecentService } from './ops-alerts-recent.service';
import { OpsAnomalyScheduler } from './ops-anomaly.scheduler';
import { OpsAsyncAnomalyScheduler } from './ops-async-anomaly.scheduler';
import { OpsAsyncReliabilityService } from './ops-async-reliability.service';
import { OpsDataReliabilityService } from './ops-data-reliability.service';
import { OpsDeadLettersService } from './ops-dead-letters.service';
import { OpsHttpMetricsService } from './ops-http-metrics.service';
import { OpsMetricsInterceptor } from './ops-metrics.interceptor';
import { OpsOverviewService } from './ops-overview.service';
import { OpsScalingService } from './ops-scaling.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductEvent, EventOutbox, PaykuPayment]),
    SubscriptionsModule,
  ],
  controllers: [AdminOpsController],
  providers: [
    OpsHttpMetricsService,
    OpsAlertsRecentService,
    OpsScalingService,
    OpsAsyncReliabilityService,
    OpsDataReliabilityService,
    OpsAnomalyScheduler,
    OpsAsyncAnomalyScheduler,
    OpsDeadLettersService,
    OpsOverviewService,
    OpsMetricsInterceptor,
    { provide: APP_INTERCEPTOR, useExisting: OpsMetricsInterceptor },
  ],
  exports: [OpsHttpMetricsService, OpsMetricsInterceptor],
})
export class OpsModule {}
