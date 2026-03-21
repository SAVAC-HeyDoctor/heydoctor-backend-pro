import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { ClinicService } from '../clinic/clinic.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PatientFiltersDto } from '../clinic/dto/patient-filters.dto';
import type { AuthActor } from '../../common/interfaces/auth-actor.interface';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { AuditActions } from '../audit-log/audit-log.constants';

@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly clinicService: ClinicService,
  ) {}

  private actor(userId: string, clinicId: string): AuthActor {
    return { userId, clinicId };
  }

  @Get()
  async findAll(
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
    @Query() filters: PatientFiltersDto,
  ) {
    return this.patientsService.findAll(clinicId, filters, this.actor(userId, clinicId));
  }

  @Audit({
    action: AuditActions.PATIENT_READ,
    resourceType: 'patient',
    patientIdParam: 'id',
    resourceIdParam: 'id',
  })
  @Get(':id/medical-record')
  async getMedicalRecord(
    @Param('id') patientId: string,
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
  ) {
    await this.patientsService.findOne(patientId, clinicId, this.actor(userId, clinicId));
    return this.clinicService.getPatientMedicalRecord(patientId, clinicId);
  }

  @Audit({
    action: AuditActions.PATIENT_READ,
    resourceType: 'patient',
    patientIdParam: 'id',
    resourceIdParam: 'id',
  })
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.patientsService.findOne(id, clinicId, this.actor(userId, clinicId));
  }

  @Post()
  async create(
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePatientDto,
  ) {
    return this.patientsService.create(dto, clinicId, this.actor(userId, clinicId));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.update(id, dto, clinicId, this.actor(userId, clinicId));
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.patientsService.remove(id, clinicId, this.actor(userId, clinicId));
  }
}
