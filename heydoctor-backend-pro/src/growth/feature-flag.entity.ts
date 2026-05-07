import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('feature_flags')
@Index(['key'], { unique: true })
export class FeatureFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  key: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'rollout_percentage', type: 'smallint', default: 100 })
  rolloutPercentage: number;

  @Column({
    name: 'forced_on_user_ids',
    type: 'uuid',
    array: true,
    default: () => "'{}'",
  })
  forcedOnUserIds: string[];

  @Column({
    name: 'forced_off_user_ids',
    type: 'uuid',
    array: true,
    default: () => "'{}'",
  })
  forcedOffUserIds: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
