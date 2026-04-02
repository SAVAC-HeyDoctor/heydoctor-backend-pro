import { Global, Module } from '@nestjs/common';
import { AppLoggerService } from './app-logger.service';
import { APP_LOGGER } from './logger.tokens';

/** Application-wide logger context (Nest Logger prefix). */
export const APP_LOGGER_CONTEXT = 'HeyDoctor';

/**
 * Global logging infrastructure. @Global is intentional: HTTP interceptors
 * registered with APP_INTERCEPTOR must resolve the logger reliably across the
 * module graph without depending on per-feature import order.
 *
 * Only APP_LOGGER is registered: injection sites must use @Inject(APP_LOGGER)
 * and must not type the constructor param as AppLoggerService (reflect-metadata
 * would otherwise ask Nest to resolve that class).
 *
 * Scale note: for very high QPS, consider a pino/winston transport with async
 * destinations or a bounded queue + worker; keep `enterRequestContext`/`getCurrentRequestId`
 * semantics when enqueuing so structured logs retain trace id. For optional sampling of
 * very chatty lines, see `log-sampling.util.ts` (off by default).
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_LOGGER,
      useFactory: () => new AppLoggerService(APP_LOGGER_CONTEXT),
    },
  ],
  exports: [APP_LOGGER],
})
export class LoggerModule {}
