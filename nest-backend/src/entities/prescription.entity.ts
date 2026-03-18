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
import { Doctor } from './doctor.entity';
import { Clinic } from './clinic.entity';

@Entity('prescriptions')
export class Prescription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  patientId: string;

  @Column('uuid')
  doctorId: string;

  @Column('uuid')
  clinicId: string;

  @Column({ type: 'jsonb' })
  medications: Array<{
    name: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }>;

  @Column({ default: 'active' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Patient, (p) => p.prescriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => Doctor, (d) => d.prescriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor: Doctor;

  @ManyToOne(() => Clinic, (c) => c.prescriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic;
}
