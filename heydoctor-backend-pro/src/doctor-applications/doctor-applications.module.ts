import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { ClinicModule } from '../clinic/clinic.module';
import { DoctorApplication } from './doctor-application.entity';
import { DoctorApplicationsController } from './doctor-applications.controller';
import { DoctorApplicationsService } from './doctor-applications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DoctorApplication]),
    AuditModule,
    ClinicModule,
  ],
  controllers: [DoctorApplicationsController],
  providers: [DoctorApplicationsService],
  exports: [DoctorApplicationsService],
})
export class DoctorApplicationsModule {}
