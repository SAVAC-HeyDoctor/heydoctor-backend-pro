import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type LoggerService,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AiService } from '../ai/ai.service';
import { AuditService } from '../audit/audit.service';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { getCurrentRequestId } from '../common/request-context.storage';
import { AuthorizationService } from '../authorization/authorization.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { PaginatedResult } from '../common/types/paginated-result.type';
import { ConsentService } from '../consents/consent.service';
import { UserRole } from '../users/user-role.enum';
import { Consultation } from './consultation.entity';
import { ConsultationStatus } from './consultation-status.enum';
import { logConsultationStatusChange } from './consultation-status-audit.helper';
import {
  assertClinicalStatusTransition,
  assertRoleForTransition,
} from './consultation-status.transitions';
import type { ConsultationAiSnapshot } from './consultation-ai-snapshot.type';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { SignConsultationDto } from './dto/sign-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';

function normalizeSignature(signature: string): string {
  const value = signature.trim();
  const marker = 'base64,';
  const idx = value.indexOf(marker);
  const base64 = idx >= 0 ? value.slice(idx + marker.length).trim() : value;
  if (!base64) {
    throw new BadRequestException('signature is empty');
  }
  return base64;
}

@Injectable()
export class ConsultationsService {
  constructor(
    @InjectRepository(Consultation)
    private readonly consultationsRepository: Repository<Consultation>,
    private readonly authorizationService: AuthorizationService,
    private readonly consentService: ConsentService,
    private readonly auditService: AuditService,
    private readonly aiService: AiService,
    @Inject(APP_LOGGER)
    private readonly logger: LoggerService,
  ) {}

  async create(
    dto: CreateConsultationDto,
    authUser: AuthenticatedUser,
  ): Promise<Consultation> {
    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);
    await this.authorizationService.assertPatientInClinic(
      authUser,
      dto.patientId,
    );

    const consent = await this.consentService.getLatestConsent(authUser.sub);
    if (!consent) {
      throw new ForbiddenException(
        'Consent required before consultation',
      );
    }

    const entity = this.consultationsRepository.create({
      patient: { id: dto.patientId },
      clinic: { id: clinicId },
      consent: { id: consent.id },
      consentVersion: consent.version,
      consentGivenAt: consent.consentGivenAt,
      consentIp: consent.ip,
      consentUserAgent: consent.userAgent,
      doctorId: authUser.sub,
      reason: dto.reason.trim(),
      status: ConsultationStatus.DRAFT,
    });
    const saved = await this.consultationsRepository.save(entity);

    void this.auditService.logSuccess({
      userId: authUser.sub,
      action: 'CONSULTATION_CREATED',
      resource: 'consultation',
      resourceId: saved.id,
      clinicId,
      httpStatus: 201,
      metadata: {
        consentId: consent.id,
      },
    });

    this.logger.log('Consultation created', {
      consultationId: saved.id,
      patientId: dto.patientId,
      doctorId: authUser.sub,
      clinicId,
    });

    return saved;
  }

  async findAll(
    authUser: AuthenticatedUser,
    pagination?: PaginationQueryDto,
  ): Promise<Consultation[] | PaginatedResult<Consultation>> {
    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);
    const paginate =
      pagination !== undefined &&
      (pagination.page !== undefined || pagination.limit !== undefined);

    if (!paginate) {
      return this.consultationsRepository.find({
        where: { clinicId },
        relations: { patient: true },
        order: { createdAt: 'DESC' },
      });
    }

    const page = pagination.page ?? 1;
    const limit = Math.min(pagination.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [data, total] = await this.consultationsRepository.findAndCount({
      where: { clinicId },
      relations: { patient: true },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async findOne(
    id: string,
    authUser: AuthenticatedUser,
  ): Promise<Consultation> {
    const { clinicId, user } =
      await this.authorizationService.getUserWithClinic(authUser);
    const consultation = await this.consultationsRepository.findOne({
      where: { id, clinicId },
      relations: { patient: true },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    await this.authorizationService.assertUserInClinic(
      authUser,
      consultation.clinicId,
      user,
    );
    return consultation;
  }

  /**
   * Same access as {@link findOne}: user’s clinic must own the consultation.
   * Used by WebRTC signaling so only authorized staff join the room.
   */
  async verifySignalingAccess(
    id: string,
    authUser: AuthenticatedUser,
  ): Promise<void> {
    await this.findOne(id, authUser);
  }

  async getConsultationAi(
    id: string,
    authUser: AuthenticatedUser,
  ): Promise<ConsultationAiSnapshot> {
    const { clinicId, user } =
      await this.authorizationService.getUserWithClinic(authUser);
    const row = await this.consultationsRepository.findOne({
      where: { id, clinicId },
      select: {
        id: true,
        aiSummary: true,
        aiSuggestedDiagnosis: true,
        aiImprovedNotes: true,
        aiGeneratedAt: true,
        clinicId: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Consultation not found');
    }
    await this.authorizationService.assertUserInClinic(
      authUser,
      row.clinicId,
      user,
    );
    return {
      summary: row.aiSummary ?? null,
      suggestedDiagnosis: row.aiSuggestedDiagnosis ?? null,
      improvedNotes: row.aiImprovedNotes ?? null,
      generatedAt: row.aiGeneratedAt ?? null,
    };
  }

  async startCall(
    id: string,
    authUser: AuthenticatedUser,
  ): Promise<{ ok: true; consultationId: string }> {
    const { clinicId, user } =
      await this.authorizationService.getUserWithClinic(authUser);

    const consent = await this.consentService.getLatestConsent(authUser.sub);
    if (!consent) {
      throw new ForbiddenException('CONSENT_REQUIRED');
    }

    const consultation = await this.consultationsRepository.findOne({
      where: { id, clinicId },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    await this.authorizationService.assertUserInClinic(
      authUser,
      consultation.clinicId,
      user,
    );

    if (
      consultation.status !== ConsultationStatus.IN_PROGRESS &&
      consultation.status !== ConsultationStatus.DRAFT
    ) {
      throw new BadRequestException(
        'Consultation must be in progress or draft to start a call',
      );
    }

    if (consultation.status === ConsultationStatus.DRAFT) {
      consultation.status = ConsultationStatus.IN_PROGRESS;
      await this.consultationsRepository.save(consultation);
    }

    void this.auditService.logSuccess({
      userId: authUser.sub,
      action: 'CONSULTATION_CALL_STARTED',
      resource: 'consultation',
      resourceId: id,
      clinicId,
      httpStatus: 200,
    });

    return { ok: true, consultationId: id };
  }

  async sign(
    id: string,
    dto: SignConsultationDto,
    authUser: AuthenticatedUser,
  ): Promise<Consultation> {
    const { clinicId, user } =
      await this.authorizationService.getUserWithClinic(authUser);
    const consultation = await this.consultationsRepository.findOne({
      where: { id, clinicId },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    await this.authorizationService.assertUserInClinic(
      authUser,
      consultation.clinicId,
      user,
    );

    if (authUser.role !== UserRole.DOCTOR) {
      throw new ForbiddenException('Only doctor can sign first');
    }
    if (consultation.doctorId !== authUser.sub) {
      throw new ForbiddenException('Only assigned doctor can sign consultation');
    }
    if (consultation.doctorSignature) {
      throw new ForbiddenException('Doctor signature already set');
    }
    if (consultation.signedAt) {
      throw new ForbiddenException('Consultation is already signed');
    }

    if (
      consultation.status !== ConsultationStatus.COMPLETED &&
      consultation.status !== ConsultationStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        `Cannot sign consultation in "${consultation.status}" status`,
      );
    }

    const previousStatus = consultation.status;
    consultation.doctorSignature = normalizeSignature(dto.signature);
    consultation.signedAt = new Date();
    consultation.status = ConsultationStatus.SIGNED;

    const saved = await this.consultationsRepository.save(consultation);

    logConsultationStatusChange({
      auditService: this.auditService,
      logger: this.logger,
      authUser,
      previousStatus,
      nextStatus: ConsultationStatus.SIGNED,
      consultationId: saved.id,
      clinicId: saved.clinicId ?? consultation.clinicId,
      doctorId: saved.doctorId,
      patientId: saved.patientId,
      requestId: getCurrentRequestId(),
    });

    void this.auditService.logSuccess({
      userId: authUser.sub,
      action: 'CONSULTATION_SIGNED',
      resource: 'consultation',
      resourceId: saved.id,
      clinicId: saved.clinicId,
      httpStatus: 201,
      metadata: {
        signerRole: authUser.role,
        signerType: 'doctor',
        signedAt: saved.signedAt?.toISOString() ?? null,
      },
    });

    return saved;
  }

  async update(
    id: string,
    dto: UpdateConsultationDto,
    authUser: AuthenticatedUser,
  ): Promise<Consultation> {
    const { clinicId, user } =
      await this.authorizationService.getUserWithClinic(authUser);
    const consultation = await this.consultationsRepository.findOne({
      where: { id, clinicId },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    await this.authorizationService.assertUserInClinic(
      authUser,
      consultation.clinicId,
      user,
    );

    if (consultation.status === ConsultationStatus.LOCKED) {
      throw new ForbiddenException('Consultation is locked and cannot be modified');
    }

    const previousStatus =
      dto.status !== undefined ? consultation.status : undefined;

    if (dto.status !== undefined) {
      assertClinicalStatusTransition(consultation.status, dto.status);
      assertRoleForTransition(
        authUser.role,
        consultation.status,
        dto.status,
      );
    }

    const prevNotes = consultation.notes;
    const prevDiagnosis = consultation.diagnosis;
    const prevTreatment = consultation.treatment;

    if (dto.diagnosis !== undefined) {
      consultation.diagnosis = dto.diagnosis;
    }
    if (dto.treatment !== undefined) {
      consultation.treatment = dto.treatment;
    }
    if (dto.notes !== undefined) {
      consultation.notes = dto.notes;
    }
    if (dto.status !== undefined) {
      consultation.status = dto.status;
    }

    const saved = await this.consultationsRepository.save(consultation);

    const clinicalDocumentationChanged =
      saved.notes !== prevNotes ||
      saved.diagnosis !== prevDiagnosis ||
      saved.treatment !== prevTreatment;

    if (clinicalDocumentationChanged) {
      this.runAiClinicalSummaryInBackground(saved);

      void this.auditService.logSuccess({
        userId: authUser.sub,
        action: 'CONSULTATION_UPDATED',
        resource: 'consultation',
        resourceId: saved.id,
        clinicId: saved.clinicId ?? clinicId,
        httpStatus: 200,
        metadata: {
          fieldsChanged: [
            saved.notes !== prevNotes ? 'notes' : null,
            saved.diagnosis !== prevDiagnosis ? 'diagnosis' : null,
            saved.treatment !== prevTreatment ? 'treatment' : null,
          ].filter(Boolean),
        },
      });
    }

    if (
      dto.status !== undefined &&
      previousStatus !== undefined &&
      dto.status !== previousStatus
    ) {
      logConsultationStatusChange({
        auditService: this.auditService,
        logger: this.logger,
        authUser,
        previousStatus,
        nextStatus: dto.status,
        consultationId: saved.id,
        clinicId: saved.clinicId ?? consultation.clinicId,
        doctorId: saved.doctorId,
        patientId: saved.patientId,
        requestId: getCurrentRequestId(),
      });
    }

    return saved;
  }

  /**
   * Non-blocking AI assist: failures are swallowed so PATCH latency and success are unchanged.
   */
  private runAiClinicalSummaryInBackground(consultation: Consultation): void {
    void (async () => {
      try {
        const result = await this.aiService.generateClinicalSummary({
          reason: consultation.reason,
          notes: consultation.notes ?? '',
          diagnosis: consultation.diagnosis ?? '',
          treatment: consultation.treatment ?? '',
        });
        await this.consultationsRepository.update(
          { id: consultation.id },
          {
            aiSummary: result.summary,
            aiSuggestedDiagnosis: result.suggestedDiagnosis,
            aiImprovedNotes: result.improvedNotes,
            aiGeneratedAt: new Date(),
          },
        );
        this.logger.log('AI summary generated', {
          consultationId: consultation.id,
          patientId: consultation.patientId,
          clinicId: consultation.clinicId,
        });
      } catch (err) {
        this.logger.error(
          'AI summary skipped or failed',
          err instanceof Error ? err : new Error(String(err)),
          {
            consultationId: consultation.id,
            patientId: consultation.patientId,
            clinicId: consultation.clinicId,
          },
        );
      }
    })();
  }

  async remove(id: string, authUser: AuthenticatedUser): Promise<void> {
    const { clinicId, user } =
      await this.authorizationService.getUserWithClinic(authUser);
    const consultation = await this.consultationsRepository.findOne({
      where: { id, clinicId },
    });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }
    await this.authorizationService.assertUserInClinic(
      authUser,
      consultation.clinicId,
      user,
    );

    if (consultation.status === ConsultationStatus.LOCKED) {
      throw new ForbiddenException('Consultation is locked and cannot be deleted');
    }

    const snapshot = { ...consultation };

    await this.consultationsRepository.remove(consultation);

    const capturedAt = new Date().toISOString();

    void this.auditService.logSuccess({
      userId: authUser.sub,
      action: 'CONSULTATION_DELETE',
      resource: 'consultation',
      resourceId: snapshot.id,
      clinicId: snapshot.clinicId,
      httpStatus: 200,
      metadata: {
        type: 'delete',
        deletedSnapshot: {
          ...snapshot,
          _meta: {
            capturedAt,
            capturedBy: authUser.sub,
          },
        },
      },
    });
  }
}
