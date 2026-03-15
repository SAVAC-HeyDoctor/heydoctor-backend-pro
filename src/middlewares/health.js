"use strict";

/**
 * Health check middleware for Railway / load balancers.
 * Responds to GET /_health with 200 { status: "ok" }.
 */
module.exports = () => {
  return async (ctx, next) => {
    if (ctx.method === "GET" && ctx.path === "/_health") {
      ctx.status = 200;
      ctx.body = { status: "ok", timestamp: new Date().toISOString() };
      return;
    }
    await next();
  };
};
