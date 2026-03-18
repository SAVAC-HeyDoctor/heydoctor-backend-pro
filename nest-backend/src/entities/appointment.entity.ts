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

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  patientId: string;

  @Column('uuid')
  doctorId: string;

  @Column('uuid')
  clinicId: string;

  @Column({ type: 'timestamp' })
  scheduledAt: Date;

  @Column({ default: 'scheduled' })
  status: string;

  @Column({ nullable: true })
  reason: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Patient, (p) => p.appointments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => Doctor, (d) => d.appointments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor: Doctor;

  @ManyToOne(() => Clinic, (c) => c.appointments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic;
}
