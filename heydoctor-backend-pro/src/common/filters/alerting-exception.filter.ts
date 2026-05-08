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

/**
 * Registra errores HTTP ≥500 para logs estructurados + hook {@link notifyAlert} (Sentry/Datadog, etc.).
 */
@Catch()
export class AlertingExceptionFilter extends BaseExceptionFilter {
  constructor(
    httpAdapterHost: HttpAdapterHost,
    @Inject(APP_LOGGER) private readonly appLogger: LoggerService,
  ) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      const req = ctx.getRequest<Request>();
      const err =
        exception instanceof Error ? exception : new Error(String(exception));
      const authUser = req.user as { sub?: string } | undefined;
      const userId =
        typeof authUser?.sub === 'string' ? authUser.sub : undefined;
      this.appLogger.error('server_error', err, {
        event: 'server_error',
        statusCode: status,
        path: typeof req.url === 'string' ? req.url : undefined,
        method: req.method,
        userId,
      });
      notifyAlert(
        {
          event: 'server_error',
          statusCode: status,
          path: typeof req.url === 'string' ? req.url : undefined,
          method: req.method,
          errorName: err.name,
          userId,
        },
        { level: 'critical' },
      );
    }

    super.catch(exception, host);
  }
}
