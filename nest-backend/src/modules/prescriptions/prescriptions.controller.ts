import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor } from '../../entities';

@Controller('prescriptions')
export class PrescriptionsController {
  constructor(
    private readonly prescriptionsService: PrescriptionsService,
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
  ) {}

  @Post()
  async create(
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePrescriptionDto,
  ) {
    const doctor = await this.doctorRepo.findOne({
      where: { userId, clinicId },
    });
    if (!doctor || !clinicId) {
      return { data: null };
    }
    return this.prescriptionsService.create(clinicId, doctor.id, dto);
  }

  @Get('patient/:id')
  async getByPatient(
    @Param('id') patientId: string,
    @ClinicId() clinicId: string,
  ) {
    if (!clinicId) {
      return { data: [] };
    }
    return this.prescriptionsService.getByPatient(patientId, clinicId);
  }

  @Get('suggest-medications')
  async suggestMedications(@Query('q') q: string) {
    return this.prescriptionsService.suggestMedications(q || '');
  }
}
