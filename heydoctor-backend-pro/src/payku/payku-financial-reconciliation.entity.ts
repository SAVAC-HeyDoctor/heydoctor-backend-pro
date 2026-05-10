import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('payku_financial_reconciliations')
@Index(['reconciliationDate'], { unique: true })
export class PaykuFinancialReconciliation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'reconciliation_date', type: 'date' })
  reconciliationDate: string;

  @Column({
    name: 'payment_succeeded_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: '0',
  })
  paymentSucceededAmount: string;

  @Column({
    name: 'active_subscriptions_revenue',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: '0',
  })
  activeSubscriptionsRevenue: string;

  @Column({
    name: 'mismatch_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: '0',
  })
  mismatchAmount: string;

  @Column({ name: 'missing_subscription_count', type: 'int', default: 0 })
  missingSubscriptionCount: number;

  @Column({
    name: 'missing_subscription_payment_ids',
    type: 'jsonb',
    default: () => "'[]'",
  })
  missingSubscriptionPaymentIds: string[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
