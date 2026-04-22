import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ClinicService } from '../clinic/clinic.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import {
  ApplicationStatus,
  DoctorApplication,
} from './doctor-application.entity';
import { CreateDoctorApplicationDto } from './dto/create-application.dto';
import { ReviewApplicationDto } from './dto/review-application.dto';

@Injectable()
export class DoctorApplicationsService {
  constructor(
    @InjectRepository(DoctorApplication)
    private readonly repo: Repository<DoctorApplication>,
    private readonly auditService: AuditService,
    private readonly clinicService: ClinicService,
  ) {}

  async create(dto: CreateDoctorApplicationDto): Promise<DoctorApplication> {
    const existing = await this.repo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('An application for this email already exists');
    }

    const clinicId = await this.clinicService.getOldestClinicId();
    if (!clinicId) {
      throw new ServiceUnavailableException(
        'No clinic configured; cannot accept applications',
      );
    }

    const entity = this.repo.create({
      ...dto,
      email: dto.email.toLowerCase(),
      licenseUrl: dto.licenseUrl ?? null,
      clinicId,
    });
    const saved = await this.repo.save(entity);

    void this.auditService.logSuccess({
      userId: null,
      action: 'DOCTOR_APPLICATION_CREATED',
      resource: 'doctor_application',
      resourceId: saved.id,
      clinicId: saved.clinicId,
      httpStatus: 201,
      metadata: { email: saved.email, specialty: saved.specialty },
    });

    return saved;
  }

  async findAll(status?: ApplicationStatus): Promise<DoctorApplication[]> {
    const where = status ? { status } : {};
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<DoctorApplication> {
    const app = await this.repo.findOne({ where: { id } });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  async review(
    id: string,
    dto: ReviewApplicationDto,
    authUser: AuthenticatedUser,
  ): Promise<DoctorApplication> {
    const app = await this.findOne(id);

    if (app.status !== ApplicationStatus.PENDING) {
      throw new ConflictException('Application has already been reviewed');
    }

    app.status = dto.status;
    app.reviewedBy = authUser.sub;
    app.reviewedAt = new Date();
    app.rejectionReason = dto.rejectionReason ?? null;

    const saved = await this.repo.save(app);

    void this.auditService.logSuccess({
      userId: authUser.sub,
      action: `DOCTOR_APPLICATION_${dto.status.toUpperCase()}`,
      resource: 'doctor_application',
      resourceId: saved.id,
      clinicId: authUser.clinicId ?? saved.clinicId,
      httpStatus: 200,
      metadata: {
        email: saved.email,
        decision: dto.status,
        rejectionReason: dto.rejectionReason,
      },
    });

    return saved;
  }
}
