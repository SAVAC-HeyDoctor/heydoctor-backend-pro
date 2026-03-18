import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Clinic } from './clinic.entity';
import { User } from './user.entity';

@Entity('clinic_users')
export class ClinicUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  clinicId: string;

  @Column('uuid')
  userId: string;

  @Column({ default: 'member' })
  role: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Clinic, (c) => c.clinicUsers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic;

  @ManyToOne(() => User, (u) => u.clinicUsers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
