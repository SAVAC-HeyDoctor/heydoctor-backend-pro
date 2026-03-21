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
import { Consultation } from './consultation.entity';
import { Diagnosis } from './diagnosis.entity';

/**
 * Medication item within a prescription. Matches Strapi medications JSON structure.
 */
export interface MedicationItem {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

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

  @Column('uuid', { nullable: true })
  consultationId: string | null;

  @Column('uuid', { nullable: true })
  diagnosisId: string | null;

  @Column({ type: 'jsonb' })
  medications: MedicationItem[];

  @Column({ type: 'text', nullable: true })
  dosage: string | null;

  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  @Column({ default: 'active' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

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

  @ManyToOne(() => Consultation, (c) => c.prescriptions, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'consultationId' })
  consultation: Consultation | null;

  @ManyToOne(() => Diagnosis, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'diagnosisId' })
  diagnosis: Diagnosis | null;
}
