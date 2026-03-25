import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { Consultation } from '../consultations/consultation.entity';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Consultation]),
    AuthorizationModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [LegalController],
  providers: [LegalService],
})
export class LegalModule {}
