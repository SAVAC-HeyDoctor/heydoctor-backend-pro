import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { ClinicalRecord } from './clinical-record.entity';
import { Consultation } from './consultation.entity';

@Entity('diagnostics')
export class Diagnostic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  clinicalRecordId: string;

  @Column('uuid', { nullable: true })
  consultationId: string | null;

  @Column()
  code: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: 'principal' })
  type: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => ClinicalRecord, (cr) => cr.diagnostics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinicalRecordId' })
  clinicalRecord: ClinicalRecord;

  @OneToOne(() => Consultation, (c) => c.diagnostic, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'consultationId' })
  consultation: Consultation | null;
}
