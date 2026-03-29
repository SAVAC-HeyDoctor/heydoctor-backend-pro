/**
 * Injection token for the single application-wide structured logger.
 * Symbol avoids collisions with string tokens from dependencies.
 * At injection sites use @Inject(APP_LOGGER) with `LoggerService` from
 * `@nestjs/common` (or `any`). Do not use `AppLoggerService` as the constructor
 * parameter type or Nest will try to resolve that class from metadata.
 */
export const APP_LOGGER = Symbol('APP_LOGGER');
