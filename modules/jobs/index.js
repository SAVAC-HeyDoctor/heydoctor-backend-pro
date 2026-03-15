"use strict";

/**
 * Job Queue - BullMQ.
 * Solo se inicializa cuando REDIS_URL está definido.
 * Casos de uso: PDF clínicos, emails, imágenes médicas, webhooks de pago.
 */
const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL;
let sharedConnection = null;

function getConnection() {
  if (!REDIS_URL) return null;
  if (sharedConnection) return sharedConnection;
  sharedConnection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  return sharedConnection;
}

let queues = {};
let workers = {};
let isEnabled = !!REDIS_URL;

function createQueue(name, opts = {}) {
  if (!isEnabled) return createNoopQueue(name);
  if (queues[name]) return queues[name];
  const conn = getConnection();
  const queue = new Queue(name, {
    connection: conn,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 100 },
      ...opts.defaultJobOptions,
    },
    ...opts,
  });
  queues[name] = queue;
  return queue;
}

function createNoopQueue(name) {
  return {
    name,
    add: async () => ({ id: null }),
    addBulk: async () => [],
    getJob: async () => null,
    close: async () => {},
  };
}

function createWorker(name, processor, opts = {}) {
  if (!isEnabled) return null;
  if (workers[name]) return workers[name];
  const conn = getConnection();
  if (!conn) return null;
  const worker = new Worker(
    name,
    async (job) => {
      try {
        return await processor(job);
      } catch (err) {
        if (global.strapi?.log) global.strapi.log.error(`Job ${name} failed:`, err.message);
        throw err;
      }
    },
    {
      connection: conn,
      concurrency: opts.concurrency ?? 1,
      ...opts,
    }
  );
  worker.on("failed", (job, err) => {
    if (global.strapi?.log) global.strapi.log.error(`Job ${job?.name} ${job?.id} failed:`, err?.message);
  });
  worker.on("completed", (job) => {
    if (global.strapi?.log) global.strapi.log.debug(`Job ${job?.name} ${job?.id} completed`);
  });
  workers[name] = worker;
  return worker;
}

async function closeAll() {
  await Promise.all(Object.values(queues).map((q) => q.close?.().catch(() => {})));
  await Promise.all(Object.values(workers).filter(Boolean).map((w) => w.close().catch(() => {})));
  if (sharedConnection) await sharedConnection.quit().catch(() => {});
  queues = {};
  workers = {};
  sharedConnection = null;
}

module.exports = {
  isEnabled: () => isEnabled,
  createQueue,
  createWorker,
  createNoopQueue,
  getConnection,
  closeAll,
};
