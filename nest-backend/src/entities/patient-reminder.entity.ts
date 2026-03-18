import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Patient } from './patient.entity';

@Entity('patient_reminders')
export class PatientReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  patientId: string;

  @Column()
  reminderType: string;

  @Column({ type: 'timestamp' })
  dueDate: Date;

  @Column({ default: 'pending' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Patient, (p) => p.reminders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;
}
