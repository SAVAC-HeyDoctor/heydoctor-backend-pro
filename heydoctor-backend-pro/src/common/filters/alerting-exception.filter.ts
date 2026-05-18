import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  type LoggerService,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { notifyAlert } from '../alerts/alert.hooks';
import { APP_LOGGER } from '../logger/logger.tokens';
import { captureException } from '../observability/sentry';

/**
 * Registra errores HTTP ≥500 para logs estructurados + hook {@link notifyAlert} (Sentry/Datadog, etc.).
 */
@Catch()
export class AlertingExceptionFilter extends BaseExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @Inject(APP_LOGGER) private readonly appLogger: LoggerService,
  ) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const req = ctx.getRequest<Request>();
    const path = typeof req.url === 'string' ? req.url : undefined;
    const isAuthPath = path?.split('?')[0]?.startsWith('/api/auth/') === true;

    if (isAuthPath) {
      const err =
        exception instanceof Error ? exception : new Error(String(exception));
      this.appLogger.warn('auth_pipeline_exception', {
        event: 'auth_pipeline_exception',
        statusCode: status,
        path,
        method: req.method,
        errorName: err.name,
      });
    }

    if (status >= 500) {
      const err =
        exception instanceof Error ? exception : new Error(String(exception));
      const authUser = req.user as { sub?: string } | undefined;
      const userId =
        typeof authUser?.sub === 'string' ? authUser.sub : undefined;
      this.appLogger.error('server_error', err, {
        event: 'server_error',
        statusCode: status,
        path,
        method: req.method,
        userId,
        errorName: err.name,
        errorMessage: err.message,
        stack: err.stack,
      });
      notifyAlert(
        {
          event: 'server_error',
          statusCode: status,
          path,
          method: req.method,
          errorName: err.name,
          userId,
        },
        { level: 'critical' },
      );
      captureException(err, {
        event: 'server_error',
        statusCode: status,
        path,
        method: req.method,
        userId,
      });
    }

    new BaseExceptionFilter(this.adapterHost.httpAdapter).catch(
      exception,
      host,
    );
  }
}
