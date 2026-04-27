import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clinic } from '../clinic/clinic.entity';
import { Consultation } from '../consultations/consultation.entity';
import { Patient } from '../patients/patient.entity';
import { PublicConsultationsController } from './public-consultations.controller';
import { PublicConsultationsService } from './public-consultations.service';

/**
 * Módulo aislado para endpoints públicos sin sesión. Lo mantenemos separado del
 * módulo `consultations` para no exponer accidentalmente sus services
 * (`ConsultationsService.create` exige `AuthenticatedUser` y consent vigente).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Clinic, Consultation, Patient])],
  controllers: [PublicConsultationsController],
  providers: [PublicConsultationsService],
})
export class PublicModule {}
