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

@Entity('lab_orders')
export class LabOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  patientId: string;

  @Column('uuid')
  doctorId: string;

  @Column('uuid')
  clinicId: string;

  @Column({ type: 'jsonb' })
  tests: string[];

  @Column({ default: 'pending' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Patient, (p) => p.labOrders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => Doctor, (d) => d.labOrders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctorId' })
  doctor: Doctor;

  @ManyToOne(() => Clinic, (c) => c.labOrders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic;
}
