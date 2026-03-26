import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { FeatureGuard } from './guards/feature.guard';
import { Subscription } from './subscription.entity';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription]), AuthModule, AuditModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, FeatureGuard],
  exports: [SubscriptionsService, FeatureGuard],
})
export class SubscriptionsModule {}
