import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { getCurrentRequestId } from '../common/request-context.storage';
import { AuthorizationService } from '../authorization/authorization.service';
import { Consultation } from './consultation.entity';
import { ConsultationStatus } from './consultation-status.enum';
import { logConsultationStatusChange } from './consultation-status-audit.helper';
import {
  assertClinicalStatusTransition,
  assertRoleForTransition,
} from './consultation-status.transitions';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    @InjectRepository(Consultation)
    private readonly consultationsRepository: Repository<Consultation>,
    private readonly authorizationService: AuthorizationService,
    private readonly auditService: AuditService,
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

    const entity = this.consultationsRepository.create({
      patient: { id: dto.patientId },
      clinic: { id: clinicId },
      doctorId: authUser.sub,
      reason: dto.reason.trim(),
      status: ConsultationStatus.DRAFT,
    });
    return this.consultationsRepository.save(entity);
  }

  async findAll(authUser: AuthenticatedUser): Promise<Consultation[]> {
    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);
    return this.consultationsRepository.find({
      where: { clinicId },
      relations: { patient: true },
      order: { createdAt: 'DESC' },
    });
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
        requestId: getCurrentRequestId(),
      });
    }

    return saved;
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

    void this.auditService.logSuccess({
      userId: authUser.sub,
      action: 'CONSULTATION_DELETE',
      resource: 'consultation',
      resourceId: snapshot.id,
      clinicId: snapshot.clinicId,
      httpStatus: 200,
      metadata: {
        type: 'delete',
        deletedSnapshot: snapshot,
      },
    });
  }
}
