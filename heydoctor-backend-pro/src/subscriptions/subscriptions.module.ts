import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { SubscriptionAlertsService } from './subscription-alerts.service';
import { FeatureGuard } from './guards/feature.guard';
import { SubscriptionEventsModule } from './subscription-events.module';
import { Subscription } from './subscription.entity';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsAnalyticsService } from './subscriptions-analytics.service';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription]),
    SubscriptionEventsModule,
    AuthModule,
    AuditModule,
    UsersModule,
  ],
  controllers: [SubscriptionsController, AdminSubscriptionsController],
  providers: [
    SubscriptionsService,
    FeatureGuard,
    SubscriptionsAnalyticsService,
    SubscriptionAlertsService,
  ],
  exports: [
    SubscriptionsService,
    FeatureGuard,
    SubscriptionAlertsService,
    SubscriptionsAnalyticsService,
  ],
})
export class SubscriptionsModule {}
