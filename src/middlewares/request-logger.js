"use strict";

const { createCorrelationId, log, captureError } = require("../../modules/observability");

/**
 * Request logging middleware con correlation ID.
 * Añade x-correlation-id al contexto y loguea request/response.
 */
module.exports = () => {
  return async (ctx, next) => {
    const correlationId =
      ctx.request.headers["x-correlation-id"] ||
      ctx.request.headers["x-request-id"] ||
      createCorrelationId();
    ctx.state.correlationId = correlationId;
    ctx.set("X-Correlation-Id", correlationId);

    const start = Date.now();
    const method = ctx.method;
    const path = ctx.path;

    try {
      await next();
    } catch (err) {
      captureError(err, { correlationId, method, path });
      throw err;
    }

    const duration = Date.now() - start;
    log("info", `${method} ${path} ${ctx.status}`, {
      correlationId,
      method,
      path,
      status: ctx.status,
      durationMs: duration,
    });
  };
};
