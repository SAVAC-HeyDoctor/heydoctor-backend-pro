import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { Consultation } from '../consultations/consultation.entity';
import { User } from '../users/user.entity';
import {
  formatLegalConsultationsCsv,
  type LegalConsultationExportRow,
} from './legal-export-csv';

type RawLegalRow = {
  consultationId: string;
  createdAt: Date;
  doctorId: string;
  patientId: string;
  consentId: string | null;
  consentVersion: string | null;
  consentGivenAt: Date | null;
  consentIp: string | null;
  consentUserAgent: string | null;
};

@Injectable()
export class LegalService {
  constructor(
    @InjectRepository(Consultation)
    private readonly consultationsRepository: Repository<Consultation>,
    private readonly authorizationService: AuthorizationService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Consultas de la clínica del administrador con consentimiento y médico enlazados.
   * Valores de consentimiento: snapshot en `consultations` si existe; si no, fila en `telemedicine_consents`.
   */
  async exportLegalConsultationsCsv(
    authUser: AuthenticatedUser,
  ): Promise<{ csv: string; rowCount: number; clinicId: string }> {
    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);

    const raw = await this.consultationsRepository
      .createQueryBuilder('c')
      .leftJoin('c.consent', 'tc')
      .leftJoin(User, 'doctor', 'doctor.id = c.doctorId')
      .where('c.clinicId = :clinicId', { clinicId })
      .select('c.id', 'consultationId')
      .addSelect('c.createdAt', 'createdAt')
      .addSelect('c.doctorId', 'doctorId')
      .addSelect('c.patientId', 'patientId')
      .addSelect('c.consentId', 'consentId')
      .addSelect('COALESCE(c.consentVersion, tc.version)', 'consentVersion')
      .addSelect(
        'COALESCE(c.consentGivenAt, tc.consentGivenAt)',
        'consentGivenAt',
      )
      .addSelect('COALESCE(c.consentIp, tc.ip)', 'consentIp')
      .addSelect(
        'COALESCE(c.consentUserAgent, tc.userAgent)',
        'consentUserAgent',
      )
      .orderBy('c.createdAt', 'ASC')
      .getRawMany<RawLegalRow>();

    const rows: LegalConsultationExportRow[] = raw.map((r) => ({
      consultationId: r.consultationId,
      createdAt: r.createdAt,
      doctorId: r.doctorId,
      patientId: r.patientId,
      consentId: r.consentId,
      consentVersion: r.consentVersion,
      consentGivenAt: r.consentGivenAt,
      consentIp: r.consentIp,
      consentUserAgent: r.consentUserAgent,
    }));

    const csv = formatLegalConsultationsCsv(rows);

    void this.auditService.logSuccess({
      userId: authUser.sub,
      action: 'LEGAL_EXPORT_DETAIL',
      resource: 'legal',
      resourceId: null,
      clinicId,
      httpStatus: 200,
      metadata: {
        rowCount: rows.length,
        exportType: 'consultations_consent_csv',
      },
    });

    return { csv, rowCount: rows.length, clinicId };
  }
}
