import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { Consultation } from '../consultations/consultation.entity';
import { Patient } from '../patients/patient.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { User } from '../users/user.entity';
import { LegalPdfController } from './legal-pdf.controller';
import { LegalPdfService } from './legal-pdf.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Consultation, Patient, User]),
    AuthorizationModule,
    AuthModule,
    SubscriptionsModule,
  ],
  controllers: [LegalPdfController],
  providers: [LegalPdfService],
})
export class LegalPdfModule {}
