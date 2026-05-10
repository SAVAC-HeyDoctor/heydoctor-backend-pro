import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum FinancialLedgerType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

@Entity('financial_ledger')
@Index(['userId', 'createdAt'])
@Index(['type', 'referenceId'], { unique: true })
export class FinancialLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: FinancialLedgerType,
  })
  type: FinancialLedgerType;

  @Column({ type: 'int' })
  amount: number;

  @Column({ name: 'reference_id', type: 'uuid' })
  referenceId: string;

  @Column({ name: 'balance_after', type: 'int' })
  balanceAfter: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
