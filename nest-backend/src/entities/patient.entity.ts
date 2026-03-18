import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Clinic } from './clinic.entity';
import { Appointment } from './appointment.entity';
import { PatientReminder } from './patient-reminder.entity';
import { LabOrder } from './lab-order.entity';
import { Prescription } from './prescription.entity';
import { ClinicalRecord } from './clinical-record.entity';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  clinicId: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  documentNumber: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Clinic, (c) => c.patients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic;

  @OneToMany(() => Appointment, (a) => a.patient)
  appointments: Appointment[];

  @OneToMany(() => PatientReminder, (pr) => pr.patient)
  reminders: PatientReminder[];

  @OneToMany(() => LabOrder, (l) => l.patient)
  labOrders: LabOrder[];

  @OneToMany(() => Prescription, (p) => p.patient)
  prescriptions: Prescription[];

  @OneToMany(() => ClinicalRecord, (c) => c.patient)
  clinicalRecords: ClinicalRecord[];
}
