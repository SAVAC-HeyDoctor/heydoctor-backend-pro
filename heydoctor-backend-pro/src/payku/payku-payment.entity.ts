import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Clinic } from '../clinic/clinic.entity';

export enum PaykuPaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

const FINAL_STATUSES = new Set<PaykuPaymentStatus>([
  PaykuPaymentStatus.PAID,
  PaykuPaymentStatus.FAILED,
  PaykuPaymentStatus.CANCELLED,
  PaykuPaymentStatus.EXPIRED,
]);

const ALLOWED_TRANSITIONS = new Map<PaykuPaymentStatus, Set<PaykuPaymentStatus>>([
  [
    PaykuPaymentStatus.PENDING,
    new Set([
      PaykuPaymentStatus.PAID,
      PaykuPaymentStatus.FAILED,
      PaykuPaymentStatus.CANCELLED,
      PaykuPaymentStatus.EXPIRED,
    ]),
  ],
]);

export function isFinalStatus(status: PaykuPaymentStatus): boolean {
  return FINAL_STATUSES.has(status);
}

export function isTransitionAllowed(
  from: PaykuPaymentStatus,
  to: PaykuPaymentStatus,
): boolean {
  return ALLOWED_TRANSITIONS.get(from)?.has(to) ?? false;
}

@Entity('payku_payments')
@Index(['userId'])
@Index(['status'])
@Index(['consultationId'])
export class PaykuPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Clinic, (clinic) => clinic.paykuPayments, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: false })
  clinicId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'consultation_id', type: 'uuid', nullable: true })
  consultationId: string | null;

  @Column({
    type: 'enum',
    enum: PaykuPaymentStatus,
    default: PaykuPaymentStatus.PENDING,
  })
  status: PaykuPaymentStatus;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'CLP' })
  currency: string;

  @Column({ name: 'transaction_id', type: 'varchar', nullable: true })
  transactionId: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
  rawResponse: Record<string, unknown> | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
