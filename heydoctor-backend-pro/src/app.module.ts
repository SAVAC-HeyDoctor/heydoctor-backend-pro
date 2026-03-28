import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { ConsentModule } from './consents/consent.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { LegalPdfModule } from './legal-pdf/legal-pdf.module';
import { LegalModule } from './legal/legal.module';
import { MetricsModule } from './metrics/metrics.module';
import { PaykuModule } from './payku/payku.module';
import { PaymentsModule } from './payments/payments.module';
import { PatientsModule } from './patients/patients.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UsersModule } from './users/users.module';
import { WebrtcModule } from './webrtc/webrtc.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 100,
        },
      ],
      /** Rate limit bucket per client IP (see Express req.ip; set trust proxy if behind a load balancer). */
      getTracker: (req) => String(req.ip ?? 'unknown'),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const publicUrl = config.get<string>('DATABASE_PUBLIC_URL');
        const privateUrl = config.get<string>('DATABASE_URL');
        console.log('[ENV] DATABASE_PUBLIC_URL:', publicUrl ? 'SET' : 'MISSING');
        console.log('[ENV] DATABASE_URL:', privateUrl ? 'SET' : 'MISSING');
        const dbUrl = publicUrl || privateUrl || '';

        if (!dbUrl) {
          console.error('[FATAL] No database URL configured!');
        }

        const masked = dbUrl ? dbUrl.replace(/:([^@]+)@/, ':***@') : 'NONE';
        console.log('[TypeORM] Connecting to:', masked);

        return {
          type: 'postgres' as const,
          url: dbUrl,
          autoLoadEntities: true,
          synchronize: true,
          logging: ['error', 'warn', 'query'],
          logger: 'advanced-console',
          retryAttempts: 1,
          retryDelay: 0,
          keepConnectionAlive: false,
          ssl: { rejectUnauthorized: false },
        };
      },
    }),
    UsersModule,
    AuthorizationModule,
    AuthModule,
    AuditModule,
    PatientsModule,
    ConsentModule,
    ConsultationsModule,
    LegalPdfModule,
    LegalModule,
    MetricsModule,
    PaykuModule,
    PaymentsModule,
    SubscriptionsModule,
    AiModule,
    WebrtcModule,
  ],
  controllers: [AppController],
  providers: [AppService, ThrottlerGuard],
})
export class AppModule {}
