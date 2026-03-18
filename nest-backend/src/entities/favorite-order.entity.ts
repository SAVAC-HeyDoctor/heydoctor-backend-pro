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

@Entity('favorite_orders')
export class FavoriteOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  clinicId: string;

  @Column('uuid')
  userId: string;

  @Column({ default: 'lab' })
  type: string;

  @Column()
  name: string;

  @Column({ type: 'jsonb', nullable: true })
  items: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Clinic, (c) => c.favoriteOrders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinicId' })
  clinic: Clinic;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
