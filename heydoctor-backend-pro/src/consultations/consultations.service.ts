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
import {
  Between,
  FindOperator,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';
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
import {
  DEFAULT_CONSULTATION_PRICE_CLP,
  type ConsultationPriceResponse,
} from './consultation-price.dto';
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
    private readonly configService: ConfigService,
    @Inject(APP_LOGGER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * Precio fijo desde env (o 15000). No usa Payku; nunca lanza por fallos externos.
   */
  getConsultationPrice(): ConsultationPriceResponse {
    const raw = this.configService.get<string>('CONSULTATION_PAYMENT_AMOUNT_CLP');
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
    // eslint-disable-next-line no-console -- visibilidad en logs Railway (diagnóstico 500)
    console.log('create consultation', {
      userId: authUser.sub,
      clinicId: null,
      patientId: dto.patientId,
      step: 'start',
    });

    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);

    // eslint-disable-next-line no-console -- visibilidad en logs Railway (diagnóstico 500)
    console.log('create consultation', {
      userId: authUser.sub,
      clinicId,
      patientId: dto.patientId,
      step: 'after_user_clinic',
    });

    await this.authorizationService.assertPatientInClinicWithContext(
      authUser,
      dto.patientId,
      clinicId,
    );

    // eslint-disable-next-line no-console -- visibilidad en logs Railway (diagnóstico 500)
    console.log('create consultation', {
      userId: authUser.sub,
      clinicId,
      patientId: dto.patientId,
      step: 'after_patient_validated',
    });

    const consent = await this.consentService.getLatestConsent(authUser.sub);

    // eslint-disable-next-line no-console -- visibilidad en logs Railway (diagnóstico 500)
    console.log('create consultation', {
      userId: authUser.sub,
      clinicId,
      patientId: dto.patientId,
      step: 'after_consent_load',
      consentId: consent?.id ?? null,
    });

    if (!consent) {
      throw new ForbiddenException(
        'Consent required before consultation',
      );
    }

    const entity = this.consultationsRepository.create({
      patient: { id: dto.patientId },
      clinicId,
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

    // eslint-disable-next-line no-console -- visibilidad en logs Railway (diagnóstico 500)
    console.log('create consultation', {
      userId: authUser.sub,
      clinicId,
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
      // eslint-disable-next-line no-console -- visibilidad en logs Railway (diagnóstico 500)
      console.log('create consultation:save_failed', {
        userId: authUser.sub,
        clinicId,
        patientId: dto.patientId,
        detail,
      });
      this.logger.error(
        'Consultation save failed',
        err instanceof Error ? err : new Error(String(err)),
        { userId: authUser.sub, clinicId, patientId: dto.patientId },
      );
      throw new BadRequestException(
        `Could not create consultation: ${detail}`,
      );
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
    const where = this.buildConsultationListWhere(clinicId, pagination);

    const paginate =
      pagination !== undefined &&
      (pagination.page !== undefined || pagination.limit !== undefined);

    if (!paginate) {
      return this.consultationsRepository.find({
        where,
        relations: { patient: true },
        order: { createdAt: 'DESC' },
      });
    }

    const page = pagination.page ?? 1;
    const limit = Math.min(pagination.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [data, total] = await this.consultationsRepository.findAndCount({
      where,
      relations: { patient: true },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  private buildConsultationListWhere(
    clinicId: string,
    pagination?: PaginationQueryDto,
  ): FindOptionsWhere<Consultation> {
    const where: FindOptionsWhere<Consultation> = { clinicId };

    if (pagination?.status !== undefined) {
      where.status = pagination.status;
    }

    if (pagination?.patientId !== undefined) {
      where.patient = { id: pagination.patientId };
    }

    const createdAt = this.consultationCreatedAtFilter(
      pagination?.from,
      pagination?.to,
    );
    if (createdAt !== undefined) {
      where.createdAt = createdAt;
    }

    return where;
  }

  private consultationCreatedAtFilter(
    from?: string,
    to?: string,
  ): FindOperator<Date> | undefined {
    if (!from?.trim() && !to?.trim()) {
      return undefined;
    }

    const start = from?.trim()
      ? this.parseConsultationListDate(from.trim(), 'start')
      : undefined;
    const end = to?.trim()
      ? this.parseConsultationListDate(to.trim(), 'end')
      : undefined;

    if (start && end) {
      return Between(start, end);
    }
    if (start) {
      return MoreThanOrEqual(start);
    }
    if (end) {
      return LessThanOrEqual(end);
    }
    return undefined;
  }

  /** Fecha calendario `YYYY-MM-DD` → día UTC completo; ISO con hora → tal cual. */
  private parseConsultationListDate(iso: string, bound: 'start' | 'end'): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      return new Date(
        bound === 'start' ? `${iso}T00:00:00.000Z` : `${iso}T23:59:59.999Z`,
      );
    }
    return new Date(iso);
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
