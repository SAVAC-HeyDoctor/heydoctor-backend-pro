import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ClinicalRecord } from './clinical-record.entity';

@Entity('treatments')
export class Treatment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  clinicalRecordId: string;

  @Column()
  description: string;

  @Column({ nullable: true })
  type: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => ClinicalRecord, (cr) => cr.treatments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinicalRecordId' })
  clinicalRecord: ClinicalRecord;
}
