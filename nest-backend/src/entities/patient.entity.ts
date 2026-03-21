import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from 'typeorm';
import { Clinic } from './clinic.entity';
import { User } from './user.entity';
import { Consultation } from './consultation.entity';
import { ClinicalRecord } from './clinical-record.entity';
import { PatientReminder } from './patient-reminder.entity';
import { LabOrder } from './lab-order.entity';
import { Prescription } from './prescription.entity';
import { Doctor } from './doctor.entity';

export type IdentificationType = 'passport' | 'id card' | 'rut';
export type GenderType = 'M' | 'F' | 'Other';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'firstname' })
  firstname: string;

  @Column({ name: 'lastname' })
  lastname: string;

  @Column({ name: 'identification', unique: true })
  identification: string;

  @Column({ name: 'identification_type', nullable: true })
  identification_type: IdentificationType | null;

  @Column({ name: 'birth_date', type: 'date' })
  birth_date: Date;

  @Column({ nullable: true })
  gender: string | null;

  @Column({ nullable: true })
  phone: string | null;

  @Column({ name: 'city', nullable: true })
  city: string | null;

  @Column({ name: 'province', nullable: true })
  province: string | null;

  @Column({ name: 'uid', nullable: true })
  uid: string | null;

  @Column({ name: 'profile_picture', nullable: true })
  profile_picture: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column('uuid', { nullable: true })
  clinicId: string | null;

  @Column('uuid', { nullable: true })
  userId: string | null;

  @ManyToOne(() => Clinic, (c) => c.patients, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic | null;

  @OneToOne(() => User, (u) => u.patient, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @OneToMany(() => Consultation, (c) => c.patient)
  consultations: Consultation[];

  @OneToMany(() => ClinicalRecord, (c) => c.patient)
  clinical_record: ClinicalRecord[];

  @OneToMany(() => PatientReminder, (pr) => pr.patient)
  reminders: PatientReminder[];

  @OneToMany(() => LabOrder, (l) => l.patient)
  labOrders: LabOrder[];

  @OneToMany(() => Prescription, (p) => p.patient)
  prescriptions: Prescription[];

  @ManyToMany(() => Doctor, (d) => d.favoritePatients, { nullable: true })
  @JoinTable({
    name: 'patient_favorite_doctors',
    joinColumn: { name: 'patient_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'doctor_id', referencedColumnName: 'id' },
  })
  favorite_doctors: Doctor[];
}
