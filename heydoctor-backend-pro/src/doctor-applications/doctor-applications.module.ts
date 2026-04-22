import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ClinicModule } from '../clinic/clinic.module';
import { DoctorApplication } from './doctor-application.entity';
import { DoctorApplicationsController } from './doctor-applications.controller';
import { DoctorApplicationsService } from './doctor-applications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DoctorApplication]),
    AuditModule,
    ClinicModule,
    forwardRef(() => AuthorizationModule),
  ],
  controllers: [DoctorApplicationsController],
  providers: [DoctorApplicationsService],
  exports: [DoctorApplicationsService],
})
export class DoctorApplicationsModule {}
