"use strict";

/**
 * Health check middleware for Railway / load balancers.
 * Responds to GET /_health with 200 { status: "ok" }.
 * Incluye redis cuando REDIS_URL está definido.
 */
module.exports = () => {
  return async (ctx, next) => {
    if (ctx.method === "GET" && ctx.path === "/_health") {
      const body = { status: "ok", timestamp: new Date().toISOString() };
      if (process.env.REDIS_URL) {
        try {
          const { getClient } = require("../../config/functions/redis-cache");
          const redis = getClient();
          if (redis) {
            const pong = await redis.ping();
            body.redis = pong === "PONG" ? "connected" : "ok";
          } else {
            body.redis = "unavailable";
          }
        } catch {
          body.redis = "error";
        }
      }
      ctx.status = 200;
      ctx.body = body;
      return;
    }
    await next();
  };
};
