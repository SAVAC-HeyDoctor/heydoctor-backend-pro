import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { assignClinic } from '../common/entity-clinic.util';
import { SubscriptionPlan, SubscriptionStatus } from './subscription.entity';
import {
  SubscriptionEvent,
  SubscriptionEventSource,
  SubscriptionEventType,
} from './subscription-event.entity';

export type SubscriptionEventAppend = {
  userId: string;
  clinicId: string;
  eventType: SubscriptionEventType;
  previousPlan?: SubscriptionPlan | null;
  newPlan?: SubscriptionPlan | null;
  previousStatus?: SubscriptionStatus | null;
  newStatus?: SubscriptionStatus | null;
  source: SubscriptionEventSource;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class SubscriptionEventsService {
  private readonly logger = new Logger(SubscriptionEventsService.name);

  constructor(
    @InjectRepository(SubscriptionEvent)
    private readonly repo: Repository<SubscriptionEvent>,
  ) {}

  async append(dto: SubscriptionEventAppend): Promise<SubscriptionEvent> {
    const row = this.repo.create({
      userId: dto.userId,
      clinicId: dto.clinicId,
      eventType: dto.eventType,
      previousPlan: dto.previousPlan ?? null,
      newPlan: dto.newPlan ?? null,
      previousStatus: dto.previousStatus ?? null,
      newStatus: dto.newStatus ?? null,
      source: dto.source,
      metadata:
        dto.metadata && Object.keys(dto.metadata).length > 0
          ? dto.metadata
          : null,
    });
    assignClinic(row, dto.clinicId);
    const saved = await this.repo.save(row);
    this.logger.log('subscription_event', {
      event: 'subscription_event',
      eventType: saved.eventType,
      userId: saved.userId,
      source: saved.source,
      previousPlan: saved.previousPlan,
      newPlan: saved.newPlan,
      previousStatus: saved.previousStatus,
      newStatus: saved.newStatus,
    });
    return saved;
  }

  async findByUserId(userId: string): Promise<SubscriptionEvent[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}
