import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { enterRequestContext } from '../request-context.storage';

/** Accept inbound trace ids (load balancers, gateways); cap length to avoid abuse. */
const REQUEST_ID_MAX = 128;
const REQUEST_ID_MIN = 8;

function pickRequestId(req: Request): string {
  const raw = req.headers['x-request-id'] ?? req.headers['x-correlation-id'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (typeof header !== 'string') {
    return randomUUID();
  }
  const trimmed = header.trim();
  if (
    trimmed.length >= REQUEST_ID_MIN &&
    trimmed.length <= REQUEST_ID_MAX &&
    /^[\w\-:.]+$/.test(trimmed)
  ) {
    return trimmed;
  }
  return randomUUID();
}

/**
 * Binds `req.requestId` and AsyncLocalStorage for the request (UUID or trusted `X-Request-Id`).
 * Use as Express middleware: `app.use(new RequestIdMiddleware().use)`.
 */
export class RequestIdMiddleware {
  use = (req: Request, res: Response, next: NextFunction): void => {
    const requestId = pickRequestId(req);
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    enterRequestContext(requestId);
    next();
  };
}
