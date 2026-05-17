import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { OpsAsyncMetricsService } from './ops-async-metrics.service';
import { OpsHttpMetricsService } from './ops-http-metrics.service';

/**
 * Registra muestras para el panel Ops (rpm, latencia, errorRate). Por instancia.
 */
@Injectable()
export class OpsMetricsInterceptor implements NestInterceptor {
  constructor(
    private readonly opsHttp: OpsHttpMetricsService,
    private readonly asyncMetrics: OpsAsyncMetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<Request>();
    const path =
      typeof req.path === 'string' && req.path.length > 0
        ? req.path
        : String(req.url?.split('?')[0] ?? '/');
    if (
      path === '/health' ||
      path === '/healthz' ||
      path === '/_health' ||
      path.startsWith('/health/') ||
      path.includes('favicon')
    ) {
      return next.handle();
    }
    const start = Date.now();
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      finalize(() => {
        const ms = Date.now() - start;
        const status = res.statusCode ?? 0;
        this.opsHttp.record(path, status, ms);
        if (path.includes('payku/webhook') && status >= 400) {
          this.asyncMetrics.recordWebhookFailure();
        }
      }),
    );
  }
}
