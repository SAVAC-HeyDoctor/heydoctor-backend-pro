import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Clinic,
  ClinicUser,
  Patient,
  Appointment,
  ClinicalRecord,
} from '../../entities';
import { ClinicService } from './clinic.service';
import {
  ClinicController,
  PatientsController,
  AppointmentsController,
} from './clinic.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Clinic,
      ClinicUser,
      Patient,
      Appointment,
      ClinicalRecord,
    ]),
  ],
  controllers: [ClinicController, PatientsController, AppointmentsController],
  providers: [ClinicService],
  exports: [ClinicService],
})
export class ClinicModule {}
