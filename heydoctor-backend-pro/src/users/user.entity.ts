import { Exclude } from 'class-transformer';
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
import { UserRole } from './user-role.enum';

@Entity('users')
@Index('users_email_clinic_unique', ['email', 'clinicId'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name: string | null;

  /** Never expose in API responses; omitted from default SELECT (see UsersService). */
  @Exclude()
  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.DOCTOR,
  })
  role: UserRole;

  @ManyToOne(() => Clinic, (clinic) => clinic.users, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: false })
  clinicId: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
