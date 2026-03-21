import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { AuditLog } from '../../entities/audit-log.entity';
import type { AuditLogOptions } from './audit-log.types';

function unwrapResponseData(
  body: unknown,
): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const data = o.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

function asUuid(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 32) return null;
  return value;
}

export interface AuditLogFromRequestInput extends AuditLogOptions {
  request: Request;
  responseBody: unknown;
  userId: string;
  clinicId: string | null | undefined;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /**
   * Registro directo (p. ej. desde otros servicios).
   */
  async log(entry: Partial<AuditLog>): Promise<void> {
    try {
      await this.auditRepo.save(this.auditRepo.create(entry));
    } catch (err) {
      this.logger.warn(
        `Failed to persist audit log (${entry.action}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Construye la fila a partir de la petición y la respuesta exitosa del handler.
   */
  async logFromRequest(input: AuditLogFromRequestInput): Promise<void> {
    const {
      request,
      responseBody,
      userId,
      clinicId,
      action,
      resourceType,
      patientIdParam,
      patientIdBodyKey,
      patientIdFromResponse,
      resourceIdParam,
      resourceIdFromResponse,
    } = input;

    const params = (request.params ?? {}) as Record<string, string>;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const data = unwrapResponseData(responseBody);

    let patientId: string | null = null;
    if (patientIdParam && params[patientIdParam]) {
      patientId = params[patientIdParam];
    } else if (patientIdBodyKey && body[patientIdBodyKey]) {
      patientId = asUuid(body[patientIdBodyKey]);
    }
    if (!patientId && patientIdFromResponse && data?.patientId) {
      patientId = asUuid(data.patientId);
    }

    let resourceId: string | null = null;
    const ridParam = resourceIdParam ?? 'id';
    if (params[ridParam]) {
      resourceId = params[ridParam];
    }
    if (!resourceId && resourceIdFromResponse && data?.id) {
      resourceId = asUuid(data.id);
    }

    const ip =
      (request.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ||
      request.socket?.remoteAddress ||
      null;

    await this.log({
      action,
      resourceType,
      resourceId,
      patientId,
      userId,
      clinicId: clinicId ?? null,
      httpMethod: request.method,
      path: request.route?.path ? `${request.baseUrl}${request.route.path}` : request.originalUrl?.slice(0, 512) ?? null,
      metadata: {
        routePath: request.route?.path ?? null,
      },
      ipAddress: ip,
    });
  }
}
