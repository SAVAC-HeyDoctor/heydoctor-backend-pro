"use strict";

const observability = require("./index");

/**
 * Registra observabilidad del pool de conexiones PostgreSQL.
 * Logs: active_connections, errores, reconexiones.
 */
function registerPoolMonitor(strapi) {
  try {
    const conn = strapi?.db?.connection;
    const client = conn?.client ?? conn;
    const pool = client?.pool ?? client?.connection?.pool;

    if (!pool) return;

    pool.on("connect", () => {
      observability.debug("db_pool connect", { type: "db_pool", event: "connect" });
    });

    pool.on("acquire", () => {
      const total = pool.totalCount ?? 0;
      const idle = pool.idleCount ?? 0;
      const active = total - idle;
      observability.debug("db_pool acquire", {
        type: "db_pool",
        event: "acquire",
        active_connections: active,
        total_connections: total,
        idle_connections: idle,
      });
    });

    pool.on("remove", () => {
      observability.debug("db_pool remove", { type: "db_pool", event: "remove" });
    });

    pool.on("error", (err) => {
      observability.captureError(err, { type: "db_pool", event: "error" });
    });

    // Log periódico de estado del pool (cada 60s)
    const interval = setInterval(() => {
      try {
        const total = pool.totalCount ?? 0;
        const idle = pool.idleCount ?? 0;
        const waiting = pool.waitingCount ?? 0;
        const active = total - idle;
        observability.debug("db_pool status", {
          type: "db_pool",
          active_connections: active,
          idle_connections: idle,
          total_connections: total,
          waiting_requests: waiting,
        });
      } catch (_) {}
    }, 60000);

    if (interval.unref) interval.unref();

    strapi?.log?.info?.("DB pool monitor: connection observability enabled");
  } catch (_) {
    // No bloquear arranque
  }
}

module.exports = { registerPoolMonitor };
