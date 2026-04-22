import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type LoggerService,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IsNull, Not, Repository } from 'typeorm';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { TelemedicineConsent } from '../consents/consent.entity';
import { Consultation } from '../consultations/consultation.entity';
import { Patient } from '../patients/patient.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { JwtUserCacheInvalidationService } from '../auth/jwt-user-cache-invalidation.service';
import { User } from '../users/user.entity';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import {
  DeletionStatus,
  GdprDeletionRequest,
} from './gdpr-deletion-request.entity';

const ANONYMIZED_EMAIL = 'deleted@anonymized.heydoctor';
const ANONYMIZED_NAME = '[DATOS ELIMINADOS]';
const ANONYMIZED_TEXT = '[REDACTED]';

@Injectable()
export class GdprService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Patient)
    private readonly patientsRepo: Repository<Patient>,
    @InjectRepository(Consultation)
    private readonly consultationsRepo: Repository<Consultation>,
    @InjectRepository(TelemedicineConsent)
    private readonly consentsRepo: Repository<TelemedicineConsent>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepo: Repository<RefreshToken>,
    @InjectRepository(GdprDeletionRequest)
    private readonly deletionRepo: Repository<GdprDeletionRequest>,
    private readonly auditService: AuditService,
    private readonly jwtUserCacheInvalidation: JwtUserCacheInvalidationService,
    @Inject(APP_LOGGER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * GDPR Art. 20 — Data portability.
   * Returns all personal data for the authenticated user in structured JSON.
   */
  async exportUserData(userId: string): Promise<{
    user: { id: string; email: string; role: string; createdAt: Date };
    consents: Array<{ version: string; consentGivenAt: Date; createdAt: Date }>;
    patients: Array<{ id: string; name: string; email: string; createdAt: Date }>;
    consultationsCount: number;
    exportedAt: string;
    format: string;
    notice: string;
  }> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const consents = await this.consentsRepo.find({
      where: { userId },
      select: ['version', 'consentGivenAt', 'createdAt'],
      order: { createdAt: 'DESC' },
    });

    const patients = await this.patientsRepo.find({
      where: { clinicId: user.clinicId },
      select: ['id', 'name', 'email', 'createdAt'],
    });

    const consultationsCount = await this.consultationsRepo.count({
      where: { doctorId: userId },
    });

    void this.auditService.logSuccess({
      userId,
      action: 'GDPR_DATA_EXPORT',
      resource: 'user',
      resourceId: userId,
      clinicId: user.clinicId,
      httpStatus: 200,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
      consents: consents.map((c) => ({
        version: c.version,
        consentGivenAt: c.consentGivenAt,
        createdAt: c.createdAt,
      })),
      patients: patients.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        createdAt: p.createdAt,
      })),
      consultationsCount,
      exportedAt: new Date().toISOString(),
      format: 'JSON (GDPR Art. 20 compliant)',
      notice:
        'Clinical records are retained per legal requirements (Chile DS 41/2012: 15 years). ' +
        'Contact privacy@heydoctor.health for full data package including consultation records.',
    };
  }

  /**
   * Step 1: Create a pending deletion request.
   * User must confirm separately (two-step flow for safety).
   */
  async requestDataDeletion(
    userId: string,
    req: Request,
  ): Promise<{ requestId: string; status: string; message: string }> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.deletionRepo.findOne({
      where: {
        userId,
        status: DeletionStatus.PENDING,
      },
    });
    if (existing) {
      return {
        requestId: existing.id,
        status: 'pending_confirmation',
        message:
          'Ya tiene una solicitud pendiente de confirmación. ' +
          'Use POST /api/gdpr/confirm-deletion para confirmar.',
      };
    }

    const request = this.deletionRepo.create({
      userId,
      clinicId: user.clinicId,
      status: DeletionStatus.PENDING,
      ipAddress: this.extractIp(req),
      userAgent: req.headers['user-agent'] ?? null,
    });
    const saved = await this.deletionRepo.save(request);

    void this.auditService.logSuccess({
      userId,
      action: 'GDPR_DELETION_REQUEST',
      resource: 'user',
      resourceId: saved.id,
      clinicId: user.clinicId,
      httpStatus: 201,
    });

    return {
      requestId: saved.id,
      status: 'pending_confirmation',
      message:
        'Su solicitud ha sido registrada. Confirme enviando POST /api/gdpr/confirm-deletion ' +
        'con { "confirm": true } para iniciar la anonimización. ' +
        'Los registros clínicos se conservan por obligación legal (15 años).',
    };
  }

  /**
   * Step 2: Confirm a pending deletion request. Marks it for background processing.
   */
  async confirmDeletion(
    userId: string,
    confirm: boolean,
  ): Promise<{ status: string; message: string }> {
    if (!confirm) {
      throw new BadRequestException('Debe enviar confirm: true para proceder.');
    }

    const request = await this.deletionRepo.findOne({
      where: { userId, status: DeletionStatus.PENDING },
    });
    if (!request) {
      throw new NotFoundException(
        'No hay solicitud de eliminación pendiente para este usuario.',
      );
    }

    request.confirmedAt = new Date();
    request.status = DeletionStatus.PROCESSING;
    await this.deletionRepo.save(request);

    void this.auditService.logSuccess({
      userId,
      action: 'GDPR_DELETION_CONFIRMED',
      resource: 'user',
      resourceId: request.id,
      clinicId: request.clinicId,
      httpStatus: 200,
    });

    return {
      status: 'processing',
      message:
        'Solicitud confirmada. La anonimización se ejecutará en el próximo ciclo de procesamiento. ' +
        'Recibirá notificación cuando se complete.',
    };
  }

  /**
   * Background job: processes confirmed deletion requests every hour.
   * Performs progressive anonymization instead of hard delete.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async processConfirmedDeletions(): Promise<void> {
    const requests = await this.deletionRepo.find({
      where: { status: DeletionStatus.PROCESSING, confirmedAt: Not(IsNull()) },
    });

    for (const request of requests) {
      try {
        const result = await this.anonymizeUser(request.userId);
        request.status = DeletionStatus.COMPLETED;
        request.processedAt = new Date();
        request.anonymizedFields = result.anonymizedFields;
        await this.deletionRepo.save(request);

        void this.auditService.logSuccess({
          userId: request.userId,
          action: 'GDPR_DATA_DELETED',
          resource: 'user',
          resourceId: request.id,
          clinicId: request.clinicId,
          httpStatus: 200,
          metadata: { anonymizedFields: result.anonymizedFields },
        });
      } catch (err) {
        request.status = DeletionStatus.FAILED;
        request.errorDetail =
          err instanceof Error ? err.message : String(err);
        await this.deletionRepo.save(request);

        this.logger.error(
          `GDPR anonymization failed for request ${request.id}`,
          err,
        );

        void this.auditService.logSuccess({
          userId: request.userId,
          action: 'GDPR_DELETION_FAILED',
          resource: 'user',
          resourceId: request.id,
          clinicId: request.clinicId,
          httpStatus: 500,
          metadata: { error: request.errorDetail },
        });
      }
    }
  }

  /**
   * Progressive anonymization pipeline.
   * - User email/password → anonymized
   * - Patient name/email for that user's clinic → anonymized
   * - Consultation clinical text → redacted (structure preserved for audit)
   * - Refresh tokens → revoked
   * - Consent IP/userAgent → cleared
   * - Clinical record IDs/timestamps → PRESERVED (legal retention)
   * - Audit logs → PRESERVED (never deleted)
   */
  private async anonymizeUser(userId: string): Promise<{
    anonymizedFields: Record<string, string[]>;
  }> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found for anonymization');

    const fields: Record<string, string[]> = {};

    // 1. Anonymize user account
    const anonSuffix = userId.slice(0, 8);
    await this.usersRepo.update(userId, {
      email: `${ANONYMIZED_EMAIL}.${anonSuffix}`,
      passwordHash: 'ANONYMIZED',
    });
    await this.jwtUserCacheInvalidation.invalidateUserCache(userId);
    fields['users'] = ['email', 'password_hash'];

    // 2. Anonymize patients belonging to user's clinic
    const patients = await this.patientsRepo.find({
      where: { clinicId: user.clinicId },
    });
    for (const patient of patients) {
      await this.patientsRepo.update(patient.id, {
        name: ANONYMIZED_NAME,
        email: `${ANONYMIZED_EMAIL}.patient.${patient.id.slice(0, 8)}`,
      });
    }
    if (patients.length > 0) {
      fields['patients'] = ['name', 'email'];
    }

    // 3. Redact consultation clinical data (preserve structure + legal metadata)
    const consultations = await this.consultationsRepo.find({
      where: { doctorId: userId },
    });
    for (const c of consultations) {
      await this.consultationsRepo.update(c.id, {
        reason: ANONYMIZED_TEXT,
        diagnosis: c.diagnosis ? ANONYMIZED_TEXT : null,
        treatment: c.treatment ? ANONYMIZED_TEXT : null,
        notes: c.notes ? ANONYMIZED_TEXT : null,
        aiSummary: c.aiSummary ? ANONYMIZED_TEXT : null,
        aiImprovedNotes: c.aiImprovedNotes ? ANONYMIZED_TEXT : null,
        aiSuggestedDiagnosis: null,
        doctorSignature: null,
        patientSignature: null,
      });
    }
    if (consultations.length > 0) {
      fields['consultations'] = [
        'reason', 'diagnosis', 'treatment', 'notes',
        'ai_summary', 'ai_improved_notes', 'ai_suggested_diagnosis',
        'doctor_signature', 'patient_signature',
      ];
    }

    // 4. Revoke all refresh tokens
    await this.refreshTokensRepo.update(
      { userId },
      { revokedAt: new Date() },
    );
    fields['refresh_tokens'] = ['revoked_at (all revoked)'];

    // 5. Clear PII from consent records (preserve consent fact + version)
    await this.consentsRepo.update(
      { userId },
      { ip: null, userAgent: null },
    );
    fields['telemedicine_consents'] = ['ip', 'user_agent'];

    return { anonymizedFields: fields };
  }

  /** Get status of user's deletion request. */
  async getDeletionStatus(userId: string): Promise<{
    status: string;
    requestId: string | null;
    createdAt: Date | null;
    processedAt: Date | null;
  }> {
    const latest = await this.deletionRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!latest) {
      return { status: 'none', requestId: null, createdAt: null, processedAt: null };
    }
    return {
      status: latest.status,
      requestId: latest.id,
      createdAt: latest.createdAt,
      processedAt: latest.processedAt,
    };
  }

  private extractIp(req: Request): string | null {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string') return xff.split(',')[0]?.trim() ?? null;
    return req.ip ?? null;
  }
}
