"use strict";

/**
 * Redis cache module - usado por rate-limit, WebSocket adapter, doctor/specialty cache.
 * Fallback automático: cuando REDIS_URL no está definido, getClient() retorna null.
 * En ese caso: cache.get retorna null, cache.set no hace nada, getOrSet retorna datos frescos.
 */
const DEFAULT_TTL = parseInt(process.env.REDIS_CACHE_TTL || "300", 10);

let client = null;
let connectionFailed = false;

function getClient() {
  if (client) return client;
  if (connectionFailed) return null;

  const url = process.env.REDIS_URL;
  if (!url) {
    connectionFailed = true;
    return null;
  }

  try {
    const Redis = require("ioredis");
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) {
          connectionFailed = true;
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: false,
    });

    client.on("error", (err) => {
      if (strapi?.log) strapi.log.error("Redis cache error:", err.message);
    });

    client.on("connect", () => {
      if (strapi?.log) strapi.log.info("Redis cache: connected");
      connectionFailed = false;
    });

    return client;
  } catch (err) {
    if (strapi?.log) strapi.log.error("Redis cache: failed to create client", err);
    connectionFailed = true;
    return null;
  }
}

async function get(key) {
  const redis = getClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function set(key, value, ttl) {
  const redis = getClient();
  if (!redis) return;
  try {
    const serialized = JSON.stringify(value);
    if (ttl != null && ttl > 0) {
      await redis.set(key, serialized, "EX", ttl);
    } else {
      await redis.set(key, serialized, "EX", DEFAULT_TTL);
    }
  } catch {
    // Non-critical
  }
}

async function del(key) {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    // Non-critical
  }
}

async function delPattern(pattern) {
  const redis = getClient();
  if (!redis) return;
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // Non-critical
  }
}

async function getOrSet(key, fetcher, ttl) {
  const cached = await get(key);
  if (cached !== null) return cached;

  const fresh = await fetcher();
  await set(key, fresh, ttl || DEFAULT_TTL);
  return fresh;
}

function isAvailable() {
  const c = getClient();
  return !!c;
}

module.exports = { getClient, get, set, del, delPattern, getOrSet, isAvailable };
