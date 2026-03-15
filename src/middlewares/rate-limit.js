"use strict";

/**
 * Rate limiting middleware para endpoints sensibles.
 * Usa Redis cuando REDIS_URL está definido (escalable horizontalmente).
 * Fallback a memoria cuando Redis no está disponible.
 */
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX = 30;
const RATE_LIMITED_PATHS = [
  "/api/doctor-applications",
  "/api/auth/local",
  "/api/custom-auth/login",
  "/api/custom-auth/register",
  "/api/payment-webhooks",
];
const GET_RATE_LIMITED_PATHS = ["/api/webrtc/ice-servers"];
const GET_RATE_LIMIT_MAX = 60;

// Fallback en memoria cuando no hay Redis
const memoryStore = new Map();

function getClientIp(ctx) {
  return (
    ctx.request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    ctx.request.headers["x-real-ip"] ||
    ctx.request.ip ||
    "unknown"
  );
}

function createMemoryRateLimiter(limit, windowSec) {
  const { RateLimiterMemory } = require("rate-limiter-flexible");
  return new RateLimiterMemory({
    points: limit,
    duration: windowSec,
  });
}

function createRedisRateLimiter(redis, limit, windowSec, keyPrefix) {
  const { RateLimiterRedis } = require("rate-limiter-flexible");
  return new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: keyPrefix || "rl",
    points: limit,
    duration: windowSec,
  });
}

function isRateLimitExceeded(err) {
  return err?.remainingPoints === 0 || err?.msBeforeNext !== undefined;
}

module.exports = (config, { strapi }) => {
  let postLimiter = null;
  let getLimiter = null;
  let useRedis = false;

  // Inicializar limiters (lazy, cuando strapi esté listo)
  function ensureLimiters() {
    if (postLimiter && getLimiter) return;

    const redis = (() => {
      try {
        const { getClient } = require("../../config/functions/redis-cache");
        return getClient();
      } catch {
        return null;
      }
    })();

    if (redis) {
      useRedis = true;
      postLimiter = createRedisRateLimiter(redis, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SEC, "rl:post");
      getLimiter = createRedisRateLimiter(redis, GET_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SEC, "rl:get");
    } else {
      postLimiter = createMemoryRateLimiter(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SEC);
      getLimiter = createMemoryRateLimiter(GET_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SEC);
    }
  }

  return async (ctx, next) => {
    const path = ctx.request.path;
    const isGetLimited = ctx.request.method === "GET" && GET_RATE_LIMITED_PATHS.some((p) => path.startsWith(p));
    const isPostLimited = RATE_LIMITED_PATHS.some((p) => path.startsWith(p)) && ctx.request.method !== "GET";

    if (!isGetLimited && !isPostLimited) {
      return next();
    }

    ensureLimiters();
    const ip = getClientIp(ctx);
    const limiter = isGetLimited ? getLimiter : postLimiter;
    const limit = isGetLimited ? GET_RATE_LIMIT_MAX : RATE_LIMIT_MAX;
    const key = isGetLimited ? `get:${ip}` : ip;

    try {
      const result = await limiter.consume(key);
      ctx.set("X-RateLimit-Limit", String(limit));
      ctx.set("X-RateLimit-Remaining", String(Math.max(0, result.remainingPoints ?? 0)));
      return next();
    } catch (err) {
      if (isRateLimitExceeded(err)) {
        const retryAfter = err?.msBeforeNext ? Math.ceil(err.msBeforeNext / 1000) : 60;
        ctx.set("Retry-After", String(retryAfter));
        return ctx.throw(429, "Demasiadas solicitudes. Intenta de nuevo más tarde.");
      }
      // Error de Redis u otro: permitir request (fail open)
      if (strapi?.log) strapi.log.warn("rate-limit error:", err?.message);
      return next();
    }
  };
};
