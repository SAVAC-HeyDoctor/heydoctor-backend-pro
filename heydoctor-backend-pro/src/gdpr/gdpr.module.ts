import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { TelemedicineConsent } from '../consents/consent.entity';
import { User } from '../users/user.entity';
import { GdprController } from './gdpr.controller';
import { GdprService } from './gdpr.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, TelemedicineConsent]),
    AuthModule,
    AuditModule,
  ],
  controllers: [GdprController],
  providers: [GdprService],
})
export class GdprModule {}
