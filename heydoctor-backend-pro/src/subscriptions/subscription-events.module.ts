import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionEvent } from './subscription-event.entity';
import { SubscriptionEventsService } from './subscription-events.service';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionEvent])],
  providers: [SubscriptionEventsService],
  exports: [SubscriptionEventsService],
})
export class SubscriptionEventsModule {}
