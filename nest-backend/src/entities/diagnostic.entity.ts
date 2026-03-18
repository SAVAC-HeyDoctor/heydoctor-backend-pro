import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ClinicalRecord } from './clinical-record.entity';

@Entity('diagnostics')
export class Diagnostic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  clinicalRecordId: string;

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
}
