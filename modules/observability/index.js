"use strict";

const crypto = require("crypto");

/**
 * Observabilidad - logs estructurados, correlation IDs, error tracking.
 * Integra con Sentry cuando SENTRY_DSN está definido.
 */

function createCorrelationId() {
  return crypto.randomUUID?.() || crypto.randomBytes(16).toString("hex");
}

function getStructuredLog(level, message, meta = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    correlationId: meta.correlationId,
    ...meta,
  };
}

function log(level, message, meta = {}) {
  const entry = getStructuredLog(level, message, meta);
  const out = JSON.stringify(entry);
  if (level === "error") {
    console.error(out);
  } else if (level === "warn") {
    console.warn(out);
  } else {
    console.log(out);
  }
  return entry;
}

function captureError(err, context = {}) {
  const entry = log("error", err?.message || String(err), {
    ...context,
    stack: err?.stack,
    name: err?.name,
  });
  if (process.env.SENTRY_DSN) {
    try {
      const { captureException } = require("../../config/functions/sentry");
      captureException(err, { extra: context });
    } catch (_) {}
  }
  return entry;
}

module.exports = {
  createCorrelationId,
  getStructuredLog,
  log,
  captureError,
  info: (msg, meta) => log("info", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  error: (msg, meta) => log("error", msg, meta),
  debug: (msg, meta) => log("debug", msg, meta),
};
