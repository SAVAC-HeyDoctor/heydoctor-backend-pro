import 'express-serve-static-core';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

declare module 'express-serve-static-core' {
  interface Request {
    /** Correlation ID for tracing (set by RequestIdMiddleware). */
    requestId?: string;
    /** Usuario JWT (Passport) en rutas protegidas. */
    user?: AuthenticatedUser;
  }
}
