import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { GrowthModule } from '../growth/growth.module';
import { FinancialLedger } from '../payku/financial-ledger.entity';
import { SubscriptionEventsModule } from '../subscriptions/subscription-events.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { EventOutbox } from './event-outbox.entity';
import { EventOutboxService } from './event-outbox.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventOutbox, FinancialLedger]),
    forwardRef(() => AuditModule),
    forwardRef(() => GrowthModule),
    SubscriptionEventsModule,
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [EventOutboxService],
  exports: [EventOutboxService],
})
export class OutboxModule {}
