import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('audit_logs')
@Index('IDX_audit_logs_user_created', ['userId', 'createdAt'])
@Index('IDX_audit_logs_clinic_created', ['clinicId', 'createdAt'])
@Index('IDX_audit_logs_patient_created', ['patientId', 'createdAt'])
@Index('IDX_audit_logs_action_created', ['action', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 32 })
  resourceType: string;

  @Column({ type: 'uuid', nullable: true })
  resourceId: string | null;

  @Column({ type: 'uuid', nullable: true })
  patientId: string | null;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  clinicId: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  httpMethod: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  path: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  ipAddress: string | null;
}
