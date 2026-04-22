import { Injectable, Logger, type LoggerService } from '@nestjs/common';
import {
  getCurrentClinicIdForLog,
  getCurrentRequestId,
  getCurrentUserIdForLog,
} from '../request-context.storage';

function isStructuredContext(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Error)
  );
}

function serializeContext(meta: Record<string, unknown>): string {
  try {
    return JSON.stringify(meta);
  } catch {
    return '"[context: not serializable]"';
  }
}

/**
 * Wraps Nest Logger and prefixes plain-text log lines with the HTTP correlation ID when
 * {@link getCurrentRequestId} is set (RequestIdMiddleware + AsyncLocalStorage).
 *
 * Structured logs (`message + Record`): the message body is left without the bracket prefix;
 * `requestId` is merged into the JSON context automatically when present (callers may omit it).
 *
 * Future scale (not implemented): async/batched sink — queue JSON lines and flush on interval
 * or backpressure; keep ALS-bound requestId at enqueue time. See AuditService for DB batching TODOs.
 */
@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly nestLogger: Logger;

  constructor(context: string) {
    this.nestLogger = new Logger(context);
  }

  private formatMessage(message: unknown): string {
    const text = typeof message === 'string' ? message : String(message ?? '');
    const requestId = getCurrentRequestId();
    const userId = getCurrentUserIdForLog();
    const clinicId = getCurrentClinicIdForLog();
    const bits: string[] = [];
    if (requestId) bits.push(`requestId=${requestId}`);
    if (userId) {
      bits.push(`userId=${userId}`);
      bits.push(`clinicId=${clinicId ?? 'null'}`);
    }
    if (bits.length > 0) {
      return `[${bits.join(' ')}] ${text}`;
    }
    return text;
  }

  private plainText(message: unknown): string {
    return typeof message === 'string' ? message : String(message ?? '');
  }

  /**
   * Adds ALS requestId into structured JSON; does not overwrite caller-provided `requestId`.
   */
  private mergeRequestMeta(
    meta?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    const requestId = getCurrentRequestId();
    const userId = getCurrentUserIdForLog();
    const clinicId = getCurrentClinicIdForLog();
    const hasInput = meta !== undefined && Object.keys(meta).length > 0;
    if (
      !requestId &&
      userId === undefined &&
      clinicId === undefined &&
      !hasInput
    ) {
      return undefined;
    }
    const out: Record<string, unknown> =
      hasInput && meta !== undefined ? { ...meta } : {};
    if (requestId !== undefined && out.requestId === undefined) {
      out.requestId = requestId;
    }
    if (userId !== undefined && out.userId === undefined) {
      out.userId = userId;
    }
    if (
      userId !== undefined &&
      out.clinicId === undefined &&
      clinicId !== undefined
    ) {
      out.clinicId = clinicId;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  private formatStructuredLine(
    level: 'INFO' | 'ERROR' | 'WARN' | 'DEBUG' | 'VERBOSE',
    rawMessage: string,
    meta?: Record<string, unknown>,
  ): string {
    const base = this.plainText(rawMessage);
    const merged = this.mergeRequestMeta(meta);
    const ts = new Date().toISOString();
    let out = `[${level}] ${ts} ${base}`;
    if (merged !== undefined && Object.keys(merged).length > 0) {
      out += ` | ${serializeContext(merged)}`;
    }
    return out;
  }

  log(message: any, context?: string): void;
  log(message: any, meta: Record<string, unknown>): void;
  log(message: any, second?: string | Record<string, unknown>): void {
    if (second === undefined) {
      this.nestLogger.log(this.formatMessage(message));
      return;
    }
    if (typeof second === 'string') {
      this.nestLogger.log(this.formatMessage(message), second);
      return;
    }
    if (isStructuredContext(second)) {
      const line = this.formatStructuredLine(
        'INFO',
        typeof message === 'string' ? message : String(message ?? ''),
        second,
      );
      this.nestLogger.log(line);
      return;
    }
    this.nestLogger.log(this.formatMessage(message), String(second));
  }

  error(message: any, trace?: string, context?: string): void;
  error(message: any, err: Error, meta?: Record<string, unknown>): void;
  error(
    message: any,
    second?: string | Error,
    third?: string | Record<string, unknown>,
  ): void {
    const text = typeof message === 'string' ? message : String(message ?? '');

    if (second instanceof Error) {
      const stack = second.stack ?? second.message;
      let meta: Record<string, unknown> | undefined;
      let nestCtx: string | undefined;
      if (isStructuredContext(third)) {
        meta = third;
      } else if (typeof third === 'string') {
        nestCtx = third;
      }
      const line = this.formatStructuredLine('ERROR', text, meta);
      this.nestLogger.error(line, stack, nestCtx);
      return;
    }

    if (second === undefined) {
      this.nestLogger.error(this.formatMessage(text));
      return;
    }

    if (typeof second === 'string' && third === undefined) {
      this.nestLogger.error(this.formatMessage(text), second);
      return;
    }

    if (typeof second === 'string' && typeof third === 'string') {
      this.nestLogger.error(this.formatMessage(text), second, third);
      return;
    }

    if (typeof second === 'string' && isStructuredContext(third)) {
      const line = this.formatStructuredLine('ERROR', text, third);
      this.nestLogger.error(line, second);
      return;
    }

    if (isStructuredContext(second)) {
      const line = this.formatStructuredLine('ERROR', text, second);
      this.nestLogger.error(line);
      return;
    }

    this.nestLogger.error(this.formatMessage(text), String(second));
  }

  warn(message: any, context?: string): void;
  warn(message: any, meta: Record<string, unknown>): void;
  warn(message: any, second?: string | Record<string, unknown>): void {
    if (second === undefined) {
      this.nestLogger.warn(this.formatMessage(message));
      return;
    }
    if (typeof second === 'string') {
      this.nestLogger.warn(this.formatMessage(message), second);
      return;
    }
    if (isStructuredContext(second)) {
      const line = this.formatStructuredLine(
        'WARN',
        typeof message === 'string' ? message : String(message ?? ''),
        second,
      );
      this.nestLogger.warn(line);
      return;
    }
    this.nestLogger.warn(this.formatMessage(message), String(second));
  }

  debug(message: any, context?: string): void;
  debug(message: any, meta: Record<string, unknown>): void;
  debug(message: any, second?: string | Record<string, unknown>): void {
    if (second === undefined) {
      this.nestLogger.debug(this.formatMessage(message));
      return;
    }
    if (typeof second === 'string') {
      this.nestLogger.debug(this.formatMessage(message), second);
      return;
    }
    if (isStructuredContext(second)) {
      const line = this.formatStructuredLine(
        'DEBUG',
        typeof message === 'string' ? message : String(message ?? ''),
        second,
      );
      this.nestLogger.debug(line);
      return;
    }
    this.nestLogger.debug(this.formatMessage(message), String(second));
  }

  verbose(message: any, context?: string): void;
  verbose(message: any, meta: Record<string, unknown>): void;
  verbose(message: any, second?: string | Record<string, unknown>): void {
    if (second === undefined) {
      this.nestLogger.verbose(this.formatMessage(message));
      return;
    }
    if (typeof second === 'string') {
      this.nestLogger.verbose(this.formatMessage(message), second);
      return;
    }
    if (isStructuredContext(second)) {
      const line = this.formatStructuredLine(
        'VERBOSE',
        typeof message === 'string' ? message : String(message ?? ''),
        second,
      );
      this.nestLogger.verbose(line);
      return;
    }
    this.nestLogger.verbose(this.formatMessage(message), String(second));
  }
}
