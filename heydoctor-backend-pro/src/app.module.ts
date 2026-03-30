import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AiModule } from './ai/ai.module';
import { AuditModule } from './audit/audit.module';
import { LoggerModule } from './common/logger/logger.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { ComplianceModule } from './compliance/compliance.module';
import { EnvConfigModule } from './config/env-config.module';
import { ConsentModule } from './consents/consent.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { LegalPdfModule } from './legal-pdf/legal-pdf.module';
import { LegalModule } from './legal/legal.module';
import { MetricsModule } from './metrics/metrics.module';
import { PaykuModule } from './payku/payku.module';
import { PatientsModule } from './patients/patients.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UsersModule } from './users/users.module';
import { DoctorApplicationsModule } from './doctor-applications/doctor-applications.module';
import { DoctorProfilesModule } from './doctor-profiles/doctor-profiles.module';
import { GdprModule } from './gdpr/gdpr.module';
import { HealthController } from './health/health.controller';
import { WebrtcModule } from './webrtc/webrtc.module';

const dbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    LoggerModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: dbUrl,
      ssl: { rejectUnauthorized: false },
      autoLoadEntities: true,
      synchronize: false,
      logging: process.env.NODE_ENV === 'production' ? false : true,
      migrations: [join(__dirname, 'migrations', '*.{js,ts}')],
      migrationsRun: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 100,
        },
      ],
      getTracker: (req) => String(req.ip ?? 'unknown'),
    }),
    UsersModule,
    AuthorizationModule,
    AuthModule,
    AuditModule,
    PatientsModule,
    EnvConfigModule,
    ComplianceModule,
    ConsentModule,
    ConsultationsModule,
    LegalPdfModule,
    LegalModule,
    MetricsModule,
    PaykuModule,
    SubscriptionsModule,
    AiModule,
    DoctorApplicationsModule,
    DoctorProfilesModule,
    GdprModule,
    WebrtcModule,
  ],
  controllers: [AppController, HealthController],
  providers: [ThrottlerGuard],
})
export class AppModule {}
