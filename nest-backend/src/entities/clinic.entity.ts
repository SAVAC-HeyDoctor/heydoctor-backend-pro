import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ClinicUser } from './clinic-user.entity';
import { Patient } from './patient.entity';
import { Doctor } from './doctor.entity';
import { Appointment } from './appointment.entity';
import { Template } from './template.entity';
import { FavoriteOrder } from './favorite-order.entity';
import { LabOrder } from './lab-order.entity';
import { Prescription } from './prescription.entity';
import { ClinicalRecord } from './clinical-record.entity';

@Entity('clinics')
export class Clinic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ClinicUser, (cu) => cu.clinic)
  clinicUsers: ClinicUser[];

  @OneToMany(() => Patient, (p) => p.clinic)
  patients: Patient[];

  @OneToMany(() => Doctor, (d) => d.clinic)
  doctors: Doctor[];

  @OneToMany(() => Appointment, (a) => a.clinic)
  appointments: Appointment[];

  @OneToMany(() => Template, (t) => t.clinic)
  templates: Template[];

  @OneToMany(() => FavoriteOrder, (f) => f.clinic)
  favoriteOrders: FavoriteOrder[];

  @OneToMany(() => LabOrder, (l) => l.clinic)
  labOrders: LabOrder[];

  @OneToMany(() => Prescription, (p) => p.clinic)
  prescriptions: Prescription[];

  @OneToMany(() => ClinicalRecord, (c) => c.clinic)
  clinicalRecords: ClinicalRecord[];
}
