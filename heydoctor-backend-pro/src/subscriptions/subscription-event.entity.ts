import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Clinic } from '../clinic/clinic.entity';
import { SubscriptionPlan, SubscriptionStatus } from './subscription.entity';

export enum SubscriptionEventType {
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_ACTIVATED = 'SUBSCRIPTION_ACTIVATED',
  SUBSCRIPTION_DEACTIVATED = 'SUBSCRIPTION_DEACTIVATED',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  PLAN_UPGRADED = 'PLAN_UPGRADED',
  PLAN_DOWNGRADED = 'PLAN_DOWNGRADED',
  PAYMENT_SUCCEEDED = 'PAYMENT_SUCCEEDED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  WEBHOOK_RECEIVED = 'WEBHOOK_RECEIVED',
  ADMIN_UPDATED = 'ADMIN_UPDATED',
}

/** Origen de escritura para analytics y soporte */
export enum SubscriptionEventSource {
  WEBHOOK = 'webhook',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

@Entity('subscription_events')
@Index(['userId', 'createdAt'])
export class SubscriptionEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Clinic, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic;

  @Column({ name: 'clinic_id', type: 'uuid' })
  clinicId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType: SubscriptionEventType;

  @Column({
    name: 'previous_plan',
    type: 'enum',
    enum: SubscriptionPlan,
    nullable: true,
  })
  previousPlan: SubscriptionPlan | null;

  @Column({
    name: 'new_plan',
    type: 'enum',
    enum: SubscriptionPlan,
    nullable: true,
  })
  newPlan: SubscriptionPlan | null;

  @Column({
    name: 'previous_status',
    type: 'enum',
    enum: SubscriptionStatus,
    nullable: true,
  })
  previousStatus: SubscriptionStatus | null;

  @Column({
    name: 'new_status',
    type: 'enum',
    enum: SubscriptionStatus,
    nullable: true,
  })
  newStatus: SubscriptionStatus | null;

  @Column({ type: 'varchar', length: 32 })
  source: SubscriptionEventSource;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
