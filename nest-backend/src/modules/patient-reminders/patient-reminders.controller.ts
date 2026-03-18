import { Controller, Get, Post, Put, Param, Body, Query } from '@nestjs/common';
import { PatientRemindersService } from './patient-reminders.service';
import { CreatePatientReminderDto } from './dto/create-reminder.dto';
import { UpdatePatientReminderDto } from './dto/update-reminder.dto';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';

@Controller('patient-reminders')
export class PatientRemindersController {
  constructor(private readonly service: PatientRemindersService) {}

  @Get()
  async findAll(
    @ClinicId() clinicId: string,
    @Query('patientId') patientId: string,
  ) {
    if (!clinicId) {
      return { data: [] };
    }
    return this.service.findAll(clinicId, patientId);
  }

  @Post()
  async create(
    @ClinicId() clinicId: string,
    @Body() dto: CreatePatientReminderDto,
  ) {
    if (!clinicId) {
      return { data: null };
    }
    return this.service.create(clinicId, dto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @ClinicId() clinicId: string,
    @Body() dto: UpdatePatientReminderDto,
  ) {
    if (!clinicId) {
      return { data: null };
    }
    return this.service.update(id, clinicId, dto);
  }
}
