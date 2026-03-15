"use strict";

/**
 * Módulo de base de datos - read replicas y helpers.
 * Cuando DATABASE_READ_HOST existe: SELECT usa replica, INSERT/UPDATE/DELETE usa primary.
 * Sin read replica: dbRead() y dbWrite() usan la misma conexión (primary).
 */
const { Pool } = require("pg");

let readPool = null;

function getReadConfig() {
  const host = process.env.DATABASE_READ_HOST;
  if (!host) return null;

  return {
    host,
    port: parseInt(process.env.DATABASE_READ_PORT || process.env.DATABASE_PORT || "5432", 10),
    database: process.env.DATABASE_READ_NAME || process.env.DATABASE_NAME,
    user: process.env.DATABASE_READ_USERNAME || process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_READ_PASSWORD || process.env.DATABASE_PASSWORD,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DATABASE_READ_POOL_MAX || "10", 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };
}

function initReadReplica(strapi) {
  const config = getReadConfig();
  if (!config) return null;

  if (readPool) return readPool;

  try {
    readPool = new Pool(config);
    strapi?.log?.info?.("Database: read replica pool initialized");
    return readPool;
  } catch (err) {
    strapi?.log?.warn?.("Database: read replica init failed", err?.message);
    return null;
  }
}

function isReadReplicaEnabled() {
  return !!process.env.DATABASE_READ_HOST && !!readPool;
}

/**
 * Conexión para lecturas (SELECT).
 * Usa read replica si está configurada, sino primary (strapi.db).
 */
function dbRead(strapi) {
  if (!strapi) return null;
  if (isReadReplicaEnabled()) {
    return {
      query: (text, params) => readPool.query(text, params),
      raw: (text, params) => readPool.query(text, params),
      _isReplica: true,
    };
  }
  const conn = strapi.db?.connection;
  if (!conn) return null;
  return {
    query: (text, bindings) => conn.raw(text, bindings).then((r) => r?.rows ?? r),
    raw: (text, bindings) => conn.raw(text, bindings),
    _isReplica: false,
  };
}

/**
 * Conexión para escrituras (INSERT/UPDATE/DELETE).
 * Siempre usa primary.
 */
function dbWrite(strapi) {
  if (!strapi?.db?.connection) return null;
  const conn = strapi.db.connection;
  return {
    query: (text, bindings) => conn.raw(text, bindings).then((r) => r?.rows ?? r),
    raw: (text, bindings) => conn.raw(text, bindings),
  };
}

async function closeReadReplica() {
  if (readPool) {
    await readPool.end().catch(() => {});
    readPool = null;
  }
}

module.exports = {
  initReadReplica,
  isReadReplicaEnabled,
  dbRead,
  dbWrite,
  closeReadReplica,
  getReadConfig,
};
