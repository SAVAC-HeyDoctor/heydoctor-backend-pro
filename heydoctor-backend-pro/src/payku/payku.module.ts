import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { Consultation } from '../consultations/consultation.entity';
import { GrowthModule } from '../growth/growth.module';
import { SubscriptionEventsModule } from '../subscriptions/subscription-events.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaykuPayment } from './payku-payment.entity';
import { PaykuController } from './payku.controller';
import { PaykuService } from './payku.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaykuPayment, Consultation]),
    AuditModule,
    AuthorizationModule,
    SubscriptionEventsModule,
    SubscriptionsModule,
    forwardRef(() => GrowthModule),
  ],
  controllers: [PaykuController],
  providers: [PaykuService],
  exports: [PaykuService],
})
export class PaykuModule {}
