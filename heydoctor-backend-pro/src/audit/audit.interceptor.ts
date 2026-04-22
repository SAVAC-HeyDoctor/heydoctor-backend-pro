import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  NestInterceptor,
  type LoggerService,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { catchError, Observable, tap, throwError } from 'rxjs';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuthorizationService } from '../authorization/authorization.service';
import { normalizeAuditPath, resolveAuditAction } from './audit-action-map';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { AuditService } from './audit.service';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    @Inject(APP_LOGGER) private readonly logger: LoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithUser>();
    const res = http.getResponse<Response>();

    if (req.method === 'OPTIONS') {
      return next.handle();
    }

    const rawUrl = req.originalUrl ?? req.url ?? '';
    const normalizedPath = normalizeAuditPath(rawUrl);
    const { action, resource } = resolveAuditAction(req.method, normalizedPath);
    const resourceId =
      (req.params?.id as string | undefined) ??
      (req.params?.patientId as string | undefined) ??
      null;

    const baseMetadata = this.buildRequestMetadata(req, normalizedPath);

    return next.handle().pipe(
      tap(() => {
        void this.safeRecordSuccess(req, res, {
          action,
          resource,
          resourceId,
          baseMetadata,
        });
      }),
      catchError((err: unknown) => {
        void this.safeRecordError(req, err, {
          action,
          resource,
          resourceId,
          baseMetadata,
        });
        return throwError(() => err);
      }),
    );
  }

  /** Fail-safe: la petición HTTP no debe fallar por errores imprevistos en auditoría. */
  private async safeRecordSuccess(
    req: RequestWithUser,
    res: Response,
    ctx: {
      action: string;
      resource: string;
      resourceId: string | null;
      baseMetadata: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.recordSuccess(req, res, ctx);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logger.error('audit_interceptor_record_success_failed', e, {
        event: 'audit_interceptor_record_success_failed',
        action: ctx.action,
        resource: ctx.resource,
      });
    }
  }

  private async safeRecordError(
    req: RequestWithUser,
    err: unknown,
    ctx: {
      action: string;
      resource: string;
      resourceId: string | null;
      baseMetadata: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.recordError(req, err, ctx);
    } catch (inner) {
      const e = inner instanceof Error ? inner : new Error(String(inner));
      this.logger.error('audit_interceptor_record_error_failed', e, {
        event: 'audit_interceptor_record_error_failed',
        action: ctx.action,
        resource: ctx.resource,
      });
    }
  }

  /**
   * Request context for audit rows; merge with extra fields (e.g. errorName) without overwriting keys.
   */
  private buildRequestMetadata(
    req: Request,
    normalizedPath: string,
  ): Record<string, unknown> {
    const rawUa = req.headers['user-agent'];
    const userAgent =
      rawUa === undefined
        ? null
        : Array.isArray(rawUa)
          ? rawUa.join(', ')
          : String(rawUa);

    return {
      method: req.method,
      path: normalizedPath,
      ip: req.ip ?? null,
      userAgent,
      requestId: req.requestId ?? null,
    };
  }

  private async resolveClinicId(
    authUser?: AuthenticatedUser,
  ): Promise<string | null> {
    if (authUser?.clinicId) {
      return authUser.clinicId;
    }
    if (!authUser?.sub) {
      return null;
    }
    try {
      const { clinicId } =
        await this.authorizationService.getUserWithClinic(authUser);
      return clinicId;
    } catch {
      return null;
    }
  }

  private async recordSuccess(
    req: RequestWithUser,
    res: Response,
    ctx: {
      action: string;
      resource: string;
      resourceId: string | null;
      baseMetadata: Record<string, unknown>;
    },
  ): Promise<void> {
    const userId = req.user?.sub ?? null;
    const clinicId = await this.resolveClinicId(req.user);
    const httpStatus =
      res.statusCode && res.statusCode > 0 ? res.statusCode : 200;

    await this.auditService.logSuccess({
      userId,
      action: ctx.action,
      resource: ctx.resource,
      resourceId: ctx.resourceId,
      clinicId,
      httpStatus,
      metadata: ctx.baseMetadata,
    });
  }

  private async recordError(
    req: RequestWithUser,
    err: unknown,
    ctx: {
      action: string;
      resource: string;
      resourceId: string | null;
      baseMetadata: Record<string, unknown>;
    },
  ): Promise<void> {
    const userId = req.user?.sub ?? null;
    const clinicId = await this.resolveClinicId(req.user);

    let httpStatus = 500;
    let errorMessage: string | null = 'Internal server error';

    if (err instanceof HttpException) {
      httpStatus = err.getStatus();
      const body = err.getResponse();
      if (typeof body === 'string') {
        errorMessage = body;
      } else if (body && typeof body === 'object' && 'message' in body) {
        const msg = (body as { message?: string | string[] }).message;
        errorMessage = Array.isArray(msg)
          ? msg.join('; ')
          : String(msg ?? err.message);
      } else {
        errorMessage = err.message;
      }
    } else if (err instanceof Error) {
      errorMessage = err.message;
    }

    await this.auditService.logError({
      userId,
      action: ctx.action,
      resource: ctx.resource,
      resourceId: ctx.resourceId,
      clinicId,
      httpStatus,
      errorMessage,
      metadata: {
        ...ctx.baseMetadata,
        errorName: err instanceof Error ? err.name : 'UnknownError',
      },
    });
  }
}
