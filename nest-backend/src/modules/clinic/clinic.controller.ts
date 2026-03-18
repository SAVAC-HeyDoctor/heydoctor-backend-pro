import { Controller, Get, Param, Query } from '@nestjs/common';
import { ClinicService } from './clinic.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { PatientFiltersDto } from './dto/patient-filters.dto';
import { AppointmentFiltersDto } from './dto/appointment-filters.dto';

@Controller('clinics')
export class ClinicController {
  constructor(private readonly clinicService: ClinicService) {}

  @Get('me')
  async getMe(@CurrentUser('userId') userId: string) {
    const clinic = await this.clinicService.getClinicForUser(userId);
    return { data: clinic };
  }
}

@Controller('patients')
export class PatientsController {
  constructor(private readonly clinicService: ClinicService) {}

  @Get()
  async getPatients(
    @ClinicId() clinicId: string,
    @Query() filters: PatientFiltersDto,
  ) {
    if (!clinicId) {
      return { data: [], total: 0 };
    }
    return this.clinicService.getPatients(clinicId, filters);
  }

  @Get(':id/medical-record')
  async getMedicalRecord(
    @Param('id') patientId: string,
    @ClinicId() clinicId: string,
  ) {
    if (!clinicId) {
      return { data: null };
    }
    return this.clinicService.getPatientMedicalRecord(patientId, clinicId);
  }
}

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly clinicService: ClinicService) {}

  @Get()
  async getAppointments(
    @ClinicId() clinicId: string,
    @Query() filters: AppointmentFiltersDto,
  ) {
    if (!clinicId) {
      return { data: [], total: 0 };
    }
    return this.clinicService.getAppointments(clinicId, filters);
  }
}
