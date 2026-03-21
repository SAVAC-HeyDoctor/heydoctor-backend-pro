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

  @Get()
  async findAll(@Query() filters: PrescriptionFiltersDto) {
    return this.prescriptionsService.findAll(filters);
  }

  @Get('patient/:patientId')
  async getByPatient(
    @Param('patientId') patientId: string,
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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.prescriptionsService.findOne(id);
  }

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

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePrescriptionDto,
  ) {
    return this.prescriptionsService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.prescriptionsService.remove(id);
  }
}
