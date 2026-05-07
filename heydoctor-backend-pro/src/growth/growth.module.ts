import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminExperimentsController } from './admin-experiments.controller';
import { AdminFeatureFlagsController } from './admin-feature-flags.controller';
import { AdminGrowthInsightsController } from './admin-growth-insights.controller';
import { GrowthExperiment } from './experiment.entity';
import { FeatureFlag } from './feature-flag.entity';
import { ProductEvent } from './product-event.entity';
import { GrowthClientController } from './growth-client.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { ExperimentsService } from './experiments.service';
import { ProductEventsService } from './product-events.service';
import { GrowthAnalyticsService } from './growth-analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeatureFlag, GrowthExperiment, ProductEvent]),
    SubscriptionsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [
    AdminFeatureFlagsController,
    AdminExperimentsController,
    AdminGrowthInsightsController,
    GrowthClientController,
  ],
  providers: [
    FeatureFlagsService,
    ExperimentsService,
    ProductEventsService,
    GrowthAnalyticsService,
  ],
  exports: [FeatureFlagsService, ExperimentsService, ProductEventsService],
})
export class GrowthModule {}
