import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { ComplianceConfig, COMPLIANCE_CONFIG_TOKEN } from './compliance.config';

/**
 * Interceptor that logs PHI access events when HIPAA_MODE is enabled.
 *
 * Triggers on routes that serve clinical data:
 * - GET /api/consultations/:id
 * - GET /api/patients
 * - GET /api/gdpr/export
 * - GET /api/legal/consultation/:id/pdf
 *
 * Logs an audit event with extended metadata (IP, user-agent, resource accessed).
 *
 * Class/file V2: new Nest DI metadata + clean build paths (no stale reflect-metadata).
 */
const PHI_ACCESS_PATTERNS = [
  /^\/api\/consultations\/[^/]+$/,
  /^\/api\/patients/,
  /^\/api\/gdpr\/export/,
  /^\/api\/legal\/consultation\/[^/]+\/pdf/,
];

@Injectable()
export class PhiAccessLogInterceptorV2 implements NestInterceptor {
  constructor(
    @Inject(COMPLIANCE_CONFIG_TOKEN)
    private readonly config: ComplianceConfig,
    private readonly auditService: AuditService,
    @Inject(APP_LOGGER)
    private readonly logger: any,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.config.hipaaMode) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method;
    if (method !== 'GET') return next.handle();

    const path = req.path;
    const isPhiAccess = PHI_ACCESS_PATTERNS.some((p) => p.test(path));
    if (!isPhiAccess) return next.handle();

    const userId =
      (req as unknown as { user?: { sub?: string } }).user?.sub ?? null;
    const ip = this.extractIp(req);
    const ua = req.headers['user-agent'] ?? null;

    return next.handle().pipe(
      tap({
        next: () => {
          void this.auditService.logSuccess({
            userId: userId ?? undefined,
            action: 'PHI_ACCESS',
            resource: 'phi',
            resourceId: path,
            httpStatus: 200,
            metadata: {
              path,
              method,
              ip,
              userAgent: ua,
              hipaaMode: true,
            },
          });
        },
        error: () => {
          this.logger.warn(
            `PHI access denied: ${method} ${path} by ${userId ?? 'anonymous'}`,
          );
        },
      }),
    );
  }

  private extractIp(req: Request): string | null {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string') return xff.split(',')[0]?.trim() ?? null;
    return req.ip ?? null;
  }
}
