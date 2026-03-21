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
import { DiagnosisService } from './diagnosis.service';
import { CreateDiagnosisDto } from './dto/create-diagnosis.dto';
import { UpdateDiagnosisDto } from './dto/update-diagnosis.dto';
import { DiagnosisFiltersDto } from './dto/diagnosis-filters.dto';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthActor } from '../../common/interfaces/auth-actor.interface';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { AuditActions } from '../audit-log/audit-log.constants';

@Controller('diagnosis')
export class DiagnosisController {
  constructor(private readonly diagnosisService: DiagnosisService) {}

  private actor(userId: string, clinicId: string): AuthActor {
    return { userId, clinicId };
  }

  @Get()
  async findAll(
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
    @Query() filters: DiagnosisFiltersDto,
  ) {
    return this.diagnosisService.findAll(clinicId, filters, this.actor(userId, clinicId));
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.diagnosisService.findOne(id, clinicId, this.actor(userId, clinicId));
  }

  @Post()
  async create(
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateDiagnosisDto,
  ) {
    return this.diagnosisService.create(dto, clinicId, this.actor(userId, clinicId));
  }

  @Audit({
    action: AuditActions.DIAGNOSIS_UPDATE,
    resourceType: 'diagnosis',
    resourceIdParam: 'id',
    patientIdFromResponse: true,
  })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateDiagnosisDto,
  ) {
    return this.diagnosisService.update(
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
    return this.diagnosisService.remove(id, clinicId, this.actor(userId, clinicId));
  }
}
