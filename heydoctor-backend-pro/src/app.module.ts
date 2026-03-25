import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { LegalModule } from './legal/legal.module';
import { PatientsModule } from './patients/patients.module';
import { UsersModule } from './users/users.module';
import { WebrtcModule } from './webrtc/webrtc.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
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
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        return {
          type: 'postgres' as const,
          url: config.getOrThrow<string>('DATABASE_URL'),
          autoLoadEntities: true,
          synchronize: !isProd,
          logging: config.get<string>('NODE_ENV') === 'development',
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
    LegalModule,
    AiModule,
    WebrtcModule,
  ],
  controllers: [AppController],
  providers: [AppService, ThrottlerGuard],
})
export class AppModule {}
