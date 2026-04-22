import {
  ConflictException,
  Inject,
  Injectable,
  type LoggerService,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { PaginatedResult } from '../common/types/paginated-result.type';
import { assignClinic } from '../common/entity-clinic.util';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { CreatePatientDto } from './dto/create-patient.dto';
import { Patient } from './patient.entity';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientsRepository: Repository<Patient>,
    private readonly authorizationService: AuthorizationService,
    private readonly auditService: AuditService,
    @Inject(APP_LOGGER)
    private readonly logger: LoggerService,
  ) {}

  async findAll(
    authUser: AuthenticatedUser,
    pagination?: PaginationQueryDto,
  ): Promise<Patient[] | PaginatedResult<Patient>> {
    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);
    const paginate =
      pagination !== undefined &&
      (pagination.page !== undefined || pagination.limit !== undefined);

    if (!paginate) {
      return this.patientsRepository.find({
        where: { clinicId },
        order: { createdAt: 'DESC' },
      });
    }

    const page = pagination.page ?? 1;
    const limit = Math.min(pagination.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [data, total] = await this.patientsRepository.findAndCount({
      where: { clinicId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async create(
    dto: CreatePatientDto,
    authUser: AuthenticatedUser,
  ): Promise<Patient> {
    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);
    const email = dto.email.trim().toLowerCase();

    const existing = await this.patientsRepository.findOne({
      where: { clinicId, email },
    });
    if (existing) {
      this.logger.warn('Business rule violation', {
        reason: 'patient email already exists in clinic',
        clinicId,
        patientId: existing.id,
      });
      throw new ConflictException('A patient with this email already exists');
    }

    const entity = this.patientsRepository.create({
      name: dto.name.trim(),
      email,
    });
    assignClinic(entity, clinicId);
    const saved = await this.patientsRepository.save(entity);

    void this.auditService.logSuccess({
      userId: authUser.sub,
      action: 'PATIENT_CREATED',
      resource: 'patient',
      resourceId: saved.id,
      clinicId,
      httpStatus: 201,
      metadata: { email: saved.email },
    });

    this.logger.log('Patient created', {
      patientId: saved.id,
      clinicId,
      actorUserId: authUser.sub,
    });

    return saved;
  }
}
