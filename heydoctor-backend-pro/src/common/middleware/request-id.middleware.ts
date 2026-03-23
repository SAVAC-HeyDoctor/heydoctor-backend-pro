import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { enterRequestContext } from '../request-context.storage';

/**
 * Assigns a unique correlation ID per HTTP request (`req.requestId`).
 * Use as Express middleware: `app.use(new RequestIdMiddleware().use)`.
 */
export class RequestIdMiddleware {
  use = (req: Request, _res: Response, next: NextFunction): void => {
    const requestId = randomUUID();
    req.requestId = requestId;
    enterRequestContext(requestId);
    next();
  };
}
