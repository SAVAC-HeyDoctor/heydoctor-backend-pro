import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
    return this.appendWithRepository(this.repo, dto, true);
  }

  async appendWithManager(
    manager: EntityManager,
    dto: SubscriptionEventAppend,
  ): Promise<SubscriptionEvent> {
    return this.appendWithRepository(
      manager.getRepository(SubscriptionEvent),
      dto,
      false,
    );
  }

  async appendOnceWithManager(
    manager: EntityManager,
    dto: SubscriptionEventAppend,
  ): Promise<SubscriptionEvent | null> {
    const paymentId =
      dto.metadata &&
      typeof dto.metadata.paymentId === 'string' &&
      dto.metadata.paymentId.trim().length > 0
        ? dto.metadata.paymentId.trim()
        : null;

    if (!paymentId) {
      return this.appendWithManager(manager, dto);
    }

    const existing = await manager.getRepository(SubscriptionEvent).findOne({
      where: {
        userId: dto.userId,
        clinicId: dto.clinicId,
        eventType: dto.eventType,
        source: dto.source,
      },
      order: { createdAt: 'DESC' },
    });

    if (
      existing?.metadata &&
      typeof existing.metadata.paymentId === 'string' &&
      existing.metadata.paymentId === paymentId
    ) {
      return existing;
    }

    const rows = (await manager.query(
      `
        INSERT INTO subscription_events (
          clinic_id,
          user_id,
          event_type,
          previous_plan,
          new_plan,
          previous_status,
          new_status,
          source,
          metadata
        )
        SELECT
          $1::uuid,
          $2::uuid,
          $3::varchar,
          $4::subscriptions_plan_enum,
          $5::subscriptions_plan_enum,
          $6::subscriptions_status_enum,
          $7::subscriptions_status_enum,
          $8::varchar,
          $9::jsonb
        WHERE NOT EXISTS (
          SELECT 1
          FROM subscription_events
          WHERE clinic_id = $1::uuid
            AND user_id = $2::uuid
            AND event_type = $3::varchar
            AND source = $8::varchar
            AND metadata @> $10::jsonb
        )
        ON CONFLICT DO NOTHING
        RETURNING *
      `,
      [
        dto.clinicId,
        dto.userId,
        dto.eventType,
        dto.previousPlan ?? null,
        dto.newPlan ?? null,
        dto.previousStatus ?? null,
        dto.newStatus ?? null,
        dto.source,
        dto.metadata && Object.keys(dto.metadata).length > 0
          ? JSON.stringify(dto.metadata)
          : null,
        JSON.stringify({ paymentId }),
      ],
    )) as Array<{
      id: string;
      clinic_id: string;
      user_id: string;
      event_type: SubscriptionEventType;
      previous_plan: SubscriptionPlan | null;
      new_plan: SubscriptionPlan | null;
      previous_status: SubscriptionStatus | null;
      new_status: SubscriptionStatus | null;
      source: SubscriptionEventSource;
      metadata: Record<string, unknown> | null;
      created_at: Date | string;
    }>;

    if (!rows[0]) {
      const existingRows = (await manager.query(
        `
          SELECT *
          FROM subscription_events
          WHERE clinic_id = $1::uuid
            AND user_id = $2::uuid
            AND event_type = $3::varchar
            AND source = $4::varchar
            AND metadata @> $5::jsonb
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [
          dto.clinicId,
          dto.userId,
          dto.eventType,
          dto.source,
          JSON.stringify({ paymentId }),
        ],
      )) as typeof rows;

      if (!existingRows[0]) {
        return null;
      }

      return this.createFromRow(manager, existingRows[0]);
    }

    return this.createFromRow(manager, rows[0]);
  }

  private createFromRow(
    manager: EntityManager,
    row: {
      id: string;
      clinic_id: string;
      user_id: string;
      event_type: SubscriptionEventType;
      previous_plan: SubscriptionPlan | null;
      new_plan: SubscriptionPlan | null;
      previous_status: SubscriptionStatus | null;
      new_status: SubscriptionStatus | null;
      source: SubscriptionEventSource;
      metadata: Record<string, unknown> | null;
      created_at: Date | string;
    },
  ): SubscriptionEvent {
    return manager.getRepository(SubscriptionEvent).create({
      id: row.id,
      clinicId: row.clinic_id,
      userId: row.user_id,
      eventType: row.event_type,
      previousPlan: row.previous_plan,
      newPlan: row.new_plan,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      source: row.source,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
    });
  }

  private async appendWithRepository(
    repo: Repository<SubscriptionEvent>,
    dto: SubscriptionEventAppend,
    emitLog: boolean,
  ): Promise<SubscriptionEvent> {
    const row = repo.create({
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
    const saved = await repo.save(row);
    if (emitLog) {
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
    }
    return saved;
  }

  async findByUserId(userId: string): Promise<SubscriptionEvent[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}
