import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Clinic } from '../clinic/clinic.entity';

@Entity('patients')
@Index('UQ_patients_clinic_email', ['clinicId', 'email'], { unique: true })
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Clinic, (clinic) => clinic.patients, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: false })
  clinicId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column()
  email: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
