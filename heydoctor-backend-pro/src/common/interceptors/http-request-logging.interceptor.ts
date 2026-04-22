import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Inject,
  type LoggerService,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { APP_LOGGER } from '../logger/logger.tokens';
import { getCurrentRequestId } from '../request-context.storage';

@Injectable()
export class HttpRequestLoggingInterceptor implements NestInterceptor {
  constructor(@Inject(APP_LOGGER) private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = Date.now();
    const requestId = req.requestId ?? getCurrentRequestId();

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Date.now() - start;
        const pathLogged =
          typeof req.path === 'string' && req.path.length > 0
            ? req.path
            : String(req.url?.split('?')[0] ?? '');
        this.logger.log('http_request_complete', {
          event: 'http_request_complete',
          requestId,
          method: req.method,
          path: pathLogged,
          statusCode: res.statusCode,
          durationMs,
        });
      }),
    );
  }
}
