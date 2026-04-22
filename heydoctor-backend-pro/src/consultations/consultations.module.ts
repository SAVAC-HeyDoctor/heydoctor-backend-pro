import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ConsentModule } from '../consents/consent.module';
import { LoggerModule } from '../common/logger/logger.module';
import { DoctorProfilesModule } from '../doctor-profiles/doctor-profiles.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { Consultation } from './consultation.entity';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Consultation]),
    AuthModule,
    AuthorizationModule,
    ConsentModule,
    DoctorProfilesModule,
    SubscriptionsModule,
    AuditModule,
    AiModule,
    LoggerModule,
  ],
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
  exports: [ConsultationsService, TypeOrmModule],
})
export class ConsultationsModule {}
