import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum EventOutboxType {
  PAYMENT_STATUS_UPDATED = 'payment_status_updated',
  PAYMENT_SUCCEEDED = 'payment_succeeded',
  PAYMENT_FAILED = 'payment_failed',
}

@Entity('event_outbox')
@Index(['processed', 'createdAt'])
@Index(['idempotencyKey'], {
  unique: true,
  where: 'idempotency_key IS NOT NULL',
})
export class EventOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  type: EventOutboxType;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ default: false })
  processed: boolean;

  @Column({ name: 'idempotency_key', type: 'text', nullable: true })
  idempotencyKey: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ default: false })
  failed: boolean;

  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true })
  failedAt: Date | null;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
