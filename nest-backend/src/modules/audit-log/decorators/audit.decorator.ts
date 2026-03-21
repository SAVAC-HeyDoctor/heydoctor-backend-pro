import { SetMetadata } from '@nestjs/common';
import type { AuditLogOptions } from '../audit-log.types';

export const AUDIT_LOG_METADATA_KEY = 'audit_log';

/** Marca el handler para que `AuditLogInterceptor` registre el evento si la petición termina con éxito. */
export const Audit = (options: AuditLogOptions) =>
  SetMetadata(AUDIT_LOG_METADATA_KEY, options);
