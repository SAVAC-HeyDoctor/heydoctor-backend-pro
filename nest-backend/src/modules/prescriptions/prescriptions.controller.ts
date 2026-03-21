import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { PrescriptionFiltersDto } from './dto/prescription-filters.dto';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthActor } from '../../common/interfaces/auth-actor.interface';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { AuditActions } from '../audit-log/audit-log.constants';

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  private actor(userId: string, clinicId: string): AuthActor {
    return { userId, clinicId };
  }

  @Get()
  async findAll(
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
    @Query() filters: PrescriptionFiltersDto,
  ) {
    return this.prescriptionsService.findAll(
      clinicId,
      filters,
      this.actor(userId, clinicId),
    );
  }

  @Get('patient/:patientId')
  async getByPatient(
    @Param('patientId') patientId: string,
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.prescriptionsService.getByPatient(
      patientId,
      clinicId,
      this.actor(userId, clinicId),
    );
  }

  @Get('suggest-medications')
  async suggestMedications(
    @Query('q') q: string,
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.prescriptionsService.suggestMedications(
      q || '',
      this.actor(userId, clinicId),
    );
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.prescriptionsService.findOne(
      id,
      clinicId,
      this.actor(userId, clinicId),
    );
  }

  @Audit({
    action: AuditActions.PRESCRIPTION_CREATE,
    resourceType: 'prescription',
    patientIdBodyKey: 'patientId',
    resourceIdFromResponse: true,
  })
  @Post()
  async create(
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePrescriptionDto,
  ) {
    return this.prescriptionsService.create(dto, this.actor(userId, clinicId));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdatePrescriptionDto,
  ) {
    return this.prescriptionsService.update(
      id,
      dto,
      clinicId,
      this.actor(userId, clinicId),
    );
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.prescriptionsService.remove(
      id,
      clinicId,
      this.actor(userId, clinicId),
    );
  }
}
