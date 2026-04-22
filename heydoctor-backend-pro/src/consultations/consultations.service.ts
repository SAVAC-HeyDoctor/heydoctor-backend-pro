import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type LoggerService,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AiService } from '../ai/ai.service';
import { AuditService } from '../audit/audit.service';
import { assignClinic } from '../common/entity-clinic.util';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { getCurrentRequestId } from '../common/request-context.storage';
import { AuthorizationService } from '../authorization/authorization.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { PaginatedResult } from '../common/types/paginated-result.type';
import { ConsentService } from '../consents/consent.service';
import { DoctorProfilesService } from '../doctor-profiles/doctor-profiles.service';
import { UserRole } from '../users/user-role.enum';
import { Consultation } from './consultation.entity';
import { ConsultationStatus } from './consultation-status.enum';
import { logConsultationStatusChange } from './consultation-status-audit.helper';
import {
  assertClinicalStatusTransition,
  assertRoleForTransition,
} from './consultation-status.transitions';
import type { ConsultationAiSnapshot } from './consultation-ai-snapshot.type';
import {
  DEFAULT_CONSULTATION_PRICE_CLP,
  type ConsultationPriceResponse,
} from './consultation-price.dto';
import {
  clampListPagination,
  parseConsultationListDate,
  requireClinicId,
} from './consultation-list.utils';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import type { ConsultationFiltersDto } from './dto/consultation-filters.dto';
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
    private readonly doctorProfilesService: DoctorProfilesService,
    private readonly auditService: AuditService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
    @Inject(APP_LOGGER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * Precio fijo desde env (o 15000). No usa Payku; nunca lanza por fallos externos.
   */
  getConsultationPrice(): ConsultationPriceResponse {
    const raw = this.configService.get<string>(
      'CONSULTATION_PAYMENT_AMOUNT_CLP',
    );
    const parsed = raw !== undefined && raw !== '' ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        amountClp: parsed,
        currency: 'CLP',
        source: 'config',
      };
    }
    return {
      amountClp: DEFAULT_CONSULTATION_PRICE_CLP,
      currency: 'CLP',
      source: 'default',
    };
  }

  async create(
    dto: CreateConsultationDto,
    authUser: AuthenticatedUser,
  ): Promise<Consultation> {
    this.logger.log('consultation_create_start', {
      event: 'consultation_create_start',
      userId: authUser.sub,
      clinicId: null,
      requestId: getCurrentRequestId(),
      patientId: dto.patientId,
      step: 'start',
    });

    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);

    this.logger.log('consultation_create_after_user_clinic', {
      event: 'consultation_create_after_user_clinic',
      userId: authUser.sub,
      clinicId,
      requestId: getCurrentRequestId(),
      patientId: dto.patientId,
      step: 'after_user_clinic',
    });

    await this.authorizationService.assertPatientInClinicWithContext(
      authUser,
      dto.patientId,
      clinicId,
    );

    this.logger.log('consultation_create_after_patient_validated', {
      event: 'consultation_create_after_patient_validated',
      userId: authUser.sub,
      clinicId,
      requestId: getCurrentRequestId(),
      patientId: dto.patientId,
      step: 'after_patient_validated',
    });

    const consent = await this.consentService.getLatestConsent(authUser.sub);

    this.logger.log('consultation_create_after_consent_load', {
      event: 'consultation_create_after_consent_load',
      userId: authUser.sub,
      clinicId,
      requestId: getCurrentRequestId(),
      patientId: dto.patientId,
      step: 'after_consent_load',
      consentId: consent?.id ?? null,
    });

    if (!consent) {
      throw new ForbiddenException('Consent required before consultation');
    }

    const entity = this.consultationsRepository.create({
      patient: { id: dto.patientId },
      consent: { id: consent.id },
      consentVersion: consent.version,
      consentGivenAt: consent.consentGivenAt,
      consentIp: consent.ip,
      consentUserAgent: consent.userAgent,
      doctorId: authUser.sub,
      reason: dto.reason.trim(),
      status: ConsultationStatus.DRAFT,
    });
    assignClinic(entity, clinicId);

    this.logger.log('consultation_create_before_save', {
      event: 'consultation_create_before_save',
      userId: authUser.sub,
      clinicId,
      requestId: getCurrentRequestId(),
      patientId: dto.patientId,
      step: 'before_save',
    });

    let saved: Consultation;
    try {
      saved = await this.consultationsRepository.save(entity);
    } catch (err) {
      const detail =
        err instanceof QueryFailedError
          ? String(err.driverError ?? err.message)
          : err instanceof Error
            ? err.message
            : String(err);
      this.logger.log('consultation_create_save_failed', {
        event: 'consultation_create_save_failed',
        userId: authUser.sub,
        clinicId,
        requestId: getCurrentRequestId(),
        patientId: dto.patientId,
        detail,
      });
      this.logger.error(
        'Consultation save failed',
        err instanceof Error ? err : new Error(String(err)),
        {
          userId: authUser.sub,
          clinicId,
          requestId: getCurrentRequestId(),
          patientId: dto.patientId,
        },
      );
      throw new BadRequestException(`Could not create consultation: ${detail}`);
    }

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

    /** Admin: todas las consultas de la clínica. Médico con perfil: solo las suyas. */
    let restrictToDoctorId: string | undefined;
    if (authUser.role !== UserRole.ADMIN) {
      try {
        const profile = await this.doctorProfilesService.findByUserId(
          authUser.sub,
        );
        if (profile) {
          restrictToDoctorId = authUser.sub;
        }
      } catch (err) {
        this.logger.warn(
          'findAll: could not resolve doctor profile; listing without doctorId filter',
          {
            userId: authUser.sub,
            detail: err instanceof Error ? err.message : String(err),
          },
        );
      }
    }

    const paginate =
      pagination !== undefined &&
      (pagination.page !== undefined || pagination.limit !== undefined);

    const limit = Math.min(pagination?.limit ?? 20, 100);
    const page = pagination?.page ?? 1;
    const offset = (page - 1) * limit;

    const filters: ConsultationFiltersDto | undefined = {
      patientId: pagination?.patientId,
      status: pagination?.status,
      from: pagination?.from,
      to: pagination?.to,
      ...(paginate ? { limit, offset } : {}),
    };

    const { data, total } = await this.findAllForClinic(clinicId, filters, {
      restrictToDoctorId,
    });

    if (!paginate) {
      return data;
    }

    return { data, total, page, limit };
  }

  /**
   * Listado con QueryBuilder: clínica obligatoria, filtro por `doctorId` solo si se indica,
   * joins `patient` y `clinic`, orden por `createdAt`.
   */
  async findAllForClinic(
    clinicId: string | undefined | null,
    filters: ConsultationFiltersDto | undefined,
    options?: { restrictToDoctorId?: string },
  ): Promise<{ data: Consultation[]; total: number }> {
    const cid = requireClinicId(clinicId);

    const qb = this.consultationsRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.patient', 'patient')
      .leftJoinAndSelect('c.clinic', 'clinic')
      .where('c.clinicId = :clinicId', { clinicId: cid });

    if (options?.restrictToDoctorId) {
      qb.andWhere('c.doctorId = :doctorId', {
        doctorId: options.restrictToDoctorId,
      });
    }

    if (filters?.patientId) {
      qb.andWhere('c.patientId = :patientId', {
        patientId: filters.patientId,
      });
    }

    if (filters?.status) {
      qb.andWhere('c.status = :status', {
        status: filters.status,
      });
    }

    if (filters?.from) {
      qb.andWhere('c.createdAt >= :from', {
        from: parseConsultationListDate(filters.from.trim(), 'start'),
      });
    }

    if (filters?.to) {
      qb.andWhere('c.createdAt <= :to', {
        to: parseConsultationListDate(filters.to.trim(), 'end'),
      });
    }

    const hasPagination =
      filters?.limit !== undefined || filters?.offset !== undefined;
    if (hasPagination) {
      const { limit, offset } = clampListPagination(
        filters.limit,
        filters.offset,
      );
      qb.skip(offset).take(limit);
    }

    const [items, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .getManyAndCount();

    return { data: items, total };
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
      throw new ForbiddenException(
        'Only assigned doctor can sign consultation',
      );
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
      throw new ForbiddenException(
        'Consultation is locked and cannot be modified',
      );
    }

    const previousStatus =
      dto.status !== undefined ? consultation.status : undefined;

    if (dto.status !== undefined) {
      assertClinicalStatusTransition(consultation.status, dto.status);
      assertRoleForTransition(authUser.role, consultation.status, dto.status);
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

      if (saved.diagnosis !== prevDiagnosis) {
        void this.auditService.logSuccess({
          userId: authUser.sub,
          action: 'DIAGNOSIS_UPDATED',
          resource: 'consultation',
          resourceId: saved.id,
          clinicId: saved.clinicId ?? clinicId,
          httpStatus: 200,
          metadata: {
            previousLength: prevDiagnosis?.length ?? 0,
            newLength: saved.diagnosis?.length ?? 0,
          },
        });
      }
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
          event: 'AI_SUMMARY_GENERATED',
          consultationId: consultation.id,
          patientId: consultation.patientId,
          clinicId: consultation.clinicId,
          requestId: getCurrentRequestId(),
          summaryChars: result.summary?.length ?? 0,
        });
        void this.auditService.logSuccess({
          userId: consultation.doctorId,
          action: 'AI_SUMMARY_GENERATED',
          resource: 'consultation',
          resourceId: consultation.id,
          clinicId: consultation.clinicId ?? null,
          httpStatus: 200,
          metadata: {
            summaryChars: result.summary?.length ?? 0,
            suggestedDiagnosisKeys:
              result.suggestedDiagnosis != null &&
              typeof result.suggestedDiagnosis === 'object'
                ? Object.keys(result.suggestedDiagnosis as object).length
                : 0,
          },
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
      throw new ForbiddenException(
        'Consultation is locked and cannot be deleted',
      );
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
