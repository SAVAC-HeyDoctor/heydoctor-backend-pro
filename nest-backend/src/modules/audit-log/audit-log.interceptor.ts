import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService } from './audit-log.service';
import { AUDIT_LOG_METADATA_KEY } from './decorators/audit.decorator';
import type { AuditLogOptions } from './audit-log.types';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<AuditLogOptions | undefined>(
      AUDIT_LOG_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId?: string } | undefined;

    return next.handle().pipe(
      tap({
        next: (responseBody: unknown) => {
          if (!user?.userId) {
            return;
          }
          void this.auditLogService.logFromRequest({
            ...options,
            request,
            responseBody,
            userId: user.userId,
            clinicId: request.clinicId as string | undefined,
          });
        },
      }),
    );
  }
}
