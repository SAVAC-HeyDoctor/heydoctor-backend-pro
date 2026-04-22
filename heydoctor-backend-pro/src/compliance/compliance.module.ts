import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { LoggerModule } from '../common/logger/logger.module';
import { ComplianceConfig, COMPLIANCE_CONFIG_TOKEN } from './compliance.config';
import { PhiAccessLogInterceptorV2 } from './phi-access-log-v2.interceptor';

/**
 * Compliance is @Global so COMPLIANCE_CONFIG_TOKEN is app-wide.
 * PHI interceptor MUST be registered with APP_INTERCEPTOR (not useGlobalInterceptors +
 * app.get) so Nest builds it in-module with full DI (Logger + Audit).
 */
@Global()
@Module({
  imports: [LoggerModule, AuditModule],
  providers: [
    {
      provide: COMPLIANCE_CONFIG_TOKEN,
      useFactory: (config: ConfigService) => new ComplianceConfig(config),
      inject: [ConfigService],
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: PhiAccessLogInterceptorV2,
    },
  ],
  exports: [COMPLIANCE_CONFIG_TOKEN],
})
export class ComplianceModule {}
