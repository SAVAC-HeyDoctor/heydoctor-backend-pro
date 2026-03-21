import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Clinic } from './clinic.entity';
import { Patient } from './patient.entity';
import { Consultation } from './consultation.entity';
import { LabOrder } from './lab-order.entity';
import { Prescription } from './prescription.entity';
import { ClinicalRecord } from './clinical-record.entity';

@Entity('doctors')
export class Doctor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('uuid')
  clinicId: string;

  @Column({ nullable: true })
  speciality: string;

  @Column({ nullable: true })
  licenseNumber: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (u) => u.doctors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Clinic, (c) => c.doctors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic;

  @OneToMany(() => Consultation, (c) => c.doctor)
  consultations: Consultation[];

  @OneToMany(() => LabOrder, (l) => l.doctor)
  labOrders: LabOrder[];

  @OneToMany(() => Prescription, (p) => p.doctor)
  prescriptions: Prescription[];

  @OneToMany(() => ClinicalRecord, (c) => c.doctor)
  clinicalRecords: ClinicalRecord[];

  @ManyToMany(() => Patient, (p) => p.favorite_doctors)
  favoritePatients: Patient[];
}
