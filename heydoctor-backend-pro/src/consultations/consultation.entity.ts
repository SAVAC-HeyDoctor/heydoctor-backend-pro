import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';
import { Clinic } from '../clinic/clinic.entity';
import { TelemedicineConsent } from '../consents/consent.entity';
import { Patient } from '../patients/patient.entity';
import { ConsultationStatus } from './consultation-status.enum';

@Index(['clinicId', 'createdAt'])
@Entity('consultations')
export class Consultation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Patient, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @RelationId((c: Consultation) => c.patient)
  patientId: string;

  @ManyToOne(() => Clinic, (clinic) => clinic.consultations, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Clinic;

  @Column({ name: 'clinic_id', type: 'uuid', nullable: false })
  clinicId: string;

  /** Consentimiento de telemedicina vigente al crear la consulta (trazabilidad legal). */
  @ManyToOne(() => TelemedicineConsent, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'consent_id' })
  consent: TelemedicineConsent | null;

  @RelationId((c: Consultation) => c.consent)
  consentId: string | null;

  /**
   * Copia inmutable de los datos del consentimiento en el momento de crear la consulta.
   * Permite prueba legal aunque el registro en `telemedicine_consents` cambie o el FK quede en null.
   */
  @Column({ name: 'consent_version', type: 'varchar', length: 32, nullable: true })
  consentVersion: string | null;

  @Column({ name: 'consent_given_at', type: 'timestamptz', nullable: true })
  consentGivenAt: Date | null;

  @Column({ name: 'consent_ip', type: 'varchar', length: 64, nullable: true })
  consentIp: string | null;

  @Column({ name: 'consent_user_agent', type: 'text', nullable: true })
  consentUserAgent: string | null;

  @Column({ name: 'doctor_signature', type: 'text', nullable: true })
  doctorSignature: string | null;

  @Column({ name: 'patient_signature', type: 'text', nullable: true })
  patientSignature: string | null;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt: Date | null;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text', nullable: true })
  diagnosis: string | null;

  @Column({ type: 'text', nullable: true })
  treatment: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: ConsultationStatus,
    default: ConsultationStatus.DRAFT,
  })
  status: ConsultationStatus;

  @Column({ name: 'ai_summary', type: 'text', nullable: true })
  aiSummary: string | null;

  @Column({ name: 'ai_suggested_diagnosis', type: 'jsonb', nullable: true })
  aiSuggestedDiagnosis: string[] | null;

  @Column({ name: 'ai_improved_notes', type: 'text', nullable: true })
  aiImprovedNotes: string | null;

  @Column({ name: 'ai_generated_at', type: 'timestamptz', nullable: true })
  aiGeneratedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
