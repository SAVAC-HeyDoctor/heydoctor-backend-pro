import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { User } from '../users/user.entity';

@Entity('clinics')
export class Clinic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToMany(() => User, (user) => user.clinic)
  users: User[];

  @OneToMany(() => Patient, (patient) => patient.clinic)
  patients: Patient[];

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
