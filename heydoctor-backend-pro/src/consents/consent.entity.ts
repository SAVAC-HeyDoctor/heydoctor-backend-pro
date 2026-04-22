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

/**
 * Versión vigente del consentimiento de telemedicina que exige el backend.
 * Al cambiar el texto legal, subir versión (p. ej. `v2`) para obligar a re-consentir;
 * no usar versiones enviadas por el cliente.
 */
export const TELEMEDICINE_CONSENT_VERSION = 'v1';

@Entity('telemedicine_consents')
@Index(['userId', 'version'], { unique: true })
export class TelemedicineConsent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => Clinic, (clinic) => clinic.telemedicineConsents, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: false })
  clinicId: string;

  /** Momento en que el usuario aceptó; fijado en servidor (no enviado por el cliente). */
  @Column({ name: 'consent_given_at', type: 'timestamptz' })
  consentGivenAt: Date;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 32 })
  version: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
