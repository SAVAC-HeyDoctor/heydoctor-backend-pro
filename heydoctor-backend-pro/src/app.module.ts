import { join } from 'path';
import { Module, type LoggerService } from '@nestjs/common';
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  HttpAdapterHost,
} from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { AppController } from './app.controller';
import { AppCacheModule } from './cache/cache.module';
import { AiModule } from './ai/ai.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuditModule } from './audit/audit.module';
import { LoggerModule } from './common/logger/logger.module';
import { APP_LOGGER } from './common/logger/logger.tokens';
import { AlertingExceptionFilter } from './common/filters/alerting-exception.filter';
import { ClinicGuard } from './common/guards/clinic.guard';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { JwtUserCacheModule } from './auth/jwt-user-cache.module';
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
import {
  HealthApiController,
  HealthController,
} from './health/health.controller';
import { WebrtcModule } from './webrtc/webrtc.module';
import { HttpRequestLoggingInterceptor } from './common/interceptors/http-request-logging.interceptor';
import { buildTypeOrmSslConfig } from './config/typeorm-ssl';

const dbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    LoggerModule,
    AppCacheModule,
    JwtUserCacheModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: dbUrl,
      ssl: buildTypeOrmSslConfig(dbUrl ?? ''),
      autoLoadEntities: true,
      synchronize: false,
      logging: process.env.NODE_ENV === 'production' ? false : true,
      migrations: [join(__dirname, 'migrations', '*.{js,ts}')],
      migrationsRun: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL?.trim();
        return {
          throttlers: [
            {
              name: 'default',
              ttl: 60_000,
              limit: 120,
            },
          ],
          ...(redisUrl
            ? { storage: new ThrottlerStorageRedisService(redisUrl) }
            : {}),
          getTracker: (req) => String(req.ip ?? 'unknown'),
        };
      },
    }),
    UsersModule,
    AuthorizationModule,
    AuthModule,
    AuditModule,
    PatientsModule,
    AppointmentsModule,
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
  controllers: [AppController, HealthController, HealthApiController],
  providers: [
    ThrottlerGuard,
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ClinicGuard },
    { provide: APP_INTERCEPTOR, useClass: HttpRequestLoggingInterceptor },
    {
      provide: APP_FILTER,
      useFactory: (httpAdapterHost: HttpAdapterHost, logger: LoggerService) =>
        new AlertingExceptionFilter(httpAdapterHost, logger),
      inject: [HttpAdapterHost, APP_LOGGER],
    },
  ],
})
export class AppModule {}
