import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Appointment } from '../appointments/appointment.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { Consultation } from '../consultations/consultation.entity';
import { DoctorApplication } from '../doctor-applications/doctor-application.entity';
import { DoctorProfile } from '../doctor-profiles/doctor-profile.entity';
import { DoctorRating } from '../doctor-profiles/doctor-rating.entity';
import { DailyMetric } from '../metrics/daily-metric.entity';
import { Patient } from '../patients/patient.entity';
import { PaykuPayment } from '../payku/payku-payment.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { TelemedicineConsent } from '../consents/consent.entity';
import { GdprDeletionRequest } from '../gdpr/gdpr-deletion-request.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../users/user.entity';

@Entity('clinics')
export class Clinic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToMany(() => User, (user) => user.clinic)
  users: User[];

  @OneToMany(() => Patient, (patient) => patient.clinic)
  patients: Patient[];

  @OneToMany(() => Consultation, (consultation) => consultation.clinic)
  consultations: Consultation[];

  @OneToMany(() => Appointment, (a) => a.clinic)
  appointments: Appointment[];

  @OneToMany(() => DoctorProfile, (p) => p.clinic)
  doctorProfiles: DoctorProfile[];

  @OneToMany(() => DoctorRating, (r) => r.clinic)
  doctorRatings: DoctorRating[];

  @OneToMany(() => Subscription, (s) => s.clinic)
  subscriptions: Subscription[];

  @OneToMany(() => PaykuPayment, (p) => p.clinic)
  paykuPayments: PaykuPayment[];

  @OneToMany(() => DoctorApplication, (a) => a.clinic)
  doctorApplications: DoctorApplication[];

  @OneToMany(() => AuditLog, (l) => l.clinic)
  auditLogs: AuditLog[];

  @OneToMany(() => GdprDeletionRequest, (g) => g.clinic)
  gdprDeletionRequests: GdprDeletionRequest[];

  @OneToMany(() => RefreshToken, (t) => t.clinic)
  refreshTokens: RefreshToken[];

  @OneToMany(() => TelemedicineConsent, (c) => c.clinic)
  telemedicineConsents: TelemedicineConsent[];

  @OneToMany(() => DailyMetric, (m) => m.clinic)
  dailyMetrics: DailyMetric[];

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
