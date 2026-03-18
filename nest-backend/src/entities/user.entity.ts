import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ClinicUser } from './clinic-user.entity';
import { Doctor } from './doctor.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ClinicUser, (cu) => cu.user)
  clinicUsers: ClinicUser[];

  @OneToMany(() => Doctor, (d) => d.user)
  doctors: Doctor[];
}
