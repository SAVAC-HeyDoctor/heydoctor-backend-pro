import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('cie10_codes')
export class Cie10Code {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ nullable: true })
  category: string;

  @CreateDateColumn()
  createdAt: Date;
}
