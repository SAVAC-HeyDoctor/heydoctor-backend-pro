"use strict";

let Sentry = null;

function initSentry(strapi) {
  const log = strapi?.log ?? console;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    log.info("Sentry: SENTRY_DSN not set, skipping initialization");
    return;
  }

  try {
    Sentry = require("@sentry/node");

    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.2"),
      enabled: process.env.NODE_ENV === "production",
    });

    log.info("Sentry: initialized successfully");
  } catch (err) {
    log.error("Sentry: failed to initialize", err);
  }
}

function getSentry() {
  return Sentry;
}

function captureException(err, context) {
  if (Sentry) {
    Sentry.captureException(err, context);
  }
}

function captureMessage(msg, level) {
  if (Sentry) {
    Sentry.captureMessage(msg, level || "info");
  }
}

module.exports = { initSentry, getSentry, captureException, captureMessage };
