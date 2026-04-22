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
import { DoctorProfile } from './doctor-profile.entity';

@Entity('doctor_ratings')
@Index(['doctorProfileId'])
export class DoctorRating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Clinic, (clinic) => clinic.doctorRatings, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: false })
  clinicId: string;

  @ManyToOne(() => DoctorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_profile_id' })
  doctorProfile: DoctorProfile;

  @Column({ name: 'doctor_profile_id', type: 'uuid' })
  doctorProfileId: string;

  @Column({ name: 'consultation_id', type: 'uuid', nullable: true })
  consultationId: string | null;

  @Column({ name: 'patient_name', type: 'varchar', length: 200 })
  patientName: string;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text', default: '' })
  comment: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
