"use strict";

const { initialize } = require("../config/functions/websockets");
const { initSentry } = require("../config/functions/sentry");
const { registerAuditListeners } = require("../modules/audit/audit.events");
const { registerMediaListeners } = require("../modules/media/media.events");
const { registerClinicalListeners } = require("../modules/clinical/clinical.events");
const { startWorkers } = require("../modules/jobs/workers");
const { registerListeners: registerNotificationListeners } = require("../modules/notifications");
const { up: runDbIndexMigration } = require("../database/migrations/20250315000000_add_performance_indexes");
const { registerSlowQueryMonitor } = require("../modules/observability/db-monitor");
const { registerPoolMonitor } = require("../modules/observability/db-pool-monitor");
const { initReadReplica } = require("../modules/database");
const { setupIndexes } = require("../modules/search/setup");
const { registerAnalyticsListeners } = require("../modules/analytics/analytics.events");
const { ensureTable: ensureAnalyticsTable } = require("../modules/analytics/clickhouse");
const { ensureTable: ensureKnowledgeGraphTable } = require("../modules/knowledge-graph/clickhouse");
const { enqueueAiInsights, startCopilotScheduler, getKnowledgeGraphQueue, getAiModelRefreshQueue, getPredictiveModelRefreshQueue } = require("../modules/jobs/queues");
const ai = require("../modules/ai");
const { registerCopilotListeners } = require("../modules/ai/copilot/copilot.events");

async function ensureDoctorApplicationPublicPermission(strapi) {
  try {
    const [publicRole] = await strapi.entityService.findMany(
      "plugin::users-permissions.role",
      { filters: { type: "public" } }
    );
    if (!publicRole) return;
    const role = await strapi.entityService.findOne(
      "plugin::users-permissions.role",
      publicRole.id,
      { populate: ["permissions"] }
    );
    const action = "api::doctor-application.doctor-application.create";
    const hasPermission = role.permissions?.some((p) => p.action === action);
    if (hasPermission) return;
    await strapi.entityService.create(
      "plugin::users-permissions.permission",
      { data: { action, role: role.id } }
    );
    strapi.log.info("doctor-application: permiso create asignado a Public");
  } catch (err) {
    strapi.log.warn("doctor-application: no se pudo asignar permiso Public", err.message);
  }
}

async function ensureSearchPermission(strapi) {
  try {
    const [authRole] = await strapi.entityService.findMany(
      "plugin::users-permissions.role",
      { filters: { type: "authenticated" } }
    );
    if (!authRole) return;
    const role = await strapi.entityService.findOne(
      "plugin::users-permissions.role",
      authRole.id,
      { populate: ["permissions"] }
    );
    const action = "api::search.search.find";
    const hasPermission = role.permissions?.some((p) => p.action === action);
    if (hasPermission) return;
    await strapi.entityService.create(
      "plugin::users-permissions.permission",
      { data: { action, role: role.id } }
    );
    strapi.log.info("search: permiso find asignado a Authenticated");
  } catch (err) {
    strapi.log.warn("search: no se pudo asignar permiso", err.message);
  }
}

async function ensurePredictiveMedicinePermission(strapi) {
  try {
    const [authRole] = await strapi.entityService.findMany(
      "plugin::users-permissions.role",
      { filters: { type: "authenticated" } }
    );
    if (!authRole) return;
    const role = await strapi.entityService.findOne(
      "plugin::users-permissions.role",
      authRole.id,
      { populate: ["permissions"] }
    );
    const action = "api::predictive-medicine.predictive-medicine.risk";
    const hasPermission = role.permissions?.some((p) => p.action === action);
    if (hasPermission) return;
    await strapi.entityService.create(
      "plugin::users-permissions.permission",
      { data: { action, role: role.id } }
    );
    strapi.log.info("predictive-medicine: permiso risk asignado a Authenticated");
  } catch (err) {
    strapi.log.warn("predictive-medicine: no se pudo asignar permiso", err.message);
  }
}

async function ensureMedicalAiPermission(strapi) {
  try {
    const [authRole] = await strapi.entityService.findMany(
      "plugin::users-permissions.role",
      { filters: { type: "authenticated" } }
    );
    if (!authRole) return;
    const role = await strapi.entityService.findOne(
      "plugin::users-permissions.role",
      authRole.id,
      { populate: ["permissions"] }
    );
    const action = "api::medical-ai.medical-ai.predict";
    const hasPermission = role.permissions?.some((p) => p.action === action);
    if (hasPermission) return;
    await strapi.entityService.create(
      "plugin::users-permissions.permission",
      { data: { action, role: role.id } }
    );
    strapi.log.info("medical-ai: permiso predict asignado a Authenticated");
  } catch (err) {
    strapi.log.warn("medical-ai: no se pudo asignar permiso", err.message);
  }
}

async function ensureKnowledgeGraphPermission(strapi) {
  try {
    const [authRole] = await strapi.entityService.findMany(
      "plugin::users-permissions.role",
      { filters: { type: "authenticated" } }
    );
    if (!authRole) return;
    const role = await strapi.entityService.findOne(
      "plugin::users-permissions.role",
      authRole.id,
      { populate: ["permissions"] }
    );
    for (const action of ["api::knowledge-graph.knowledge-graph.query", "api::knowledge-graph.knowledge-graph.build"]) {
      const hasPermission = role.permissions?.some((p) => p.action === action);
      if (hasPermission) continue;
      await strapi.entityService.create(
        "plugin::users-permissions.permission",
        { data: { action, role: role.id } }
      );
    }
    strapi.log.info("knowledge-graph: permisos query y build asignados a Authenticated");
  } catch (err) {
    strapi.log.warn("knowledge-graph: no se pudo asignar permiso", err.message);
  }
}

async function ensureClinicalIntelligencePermission(strapi) {
  try {
    const [authRole] = await strapi.entityService.findMany(
      "plugin::users-permissions.role",
      { filters: { type: "authenticated" } }
    );
    if (!authRole) return;
    const role = await strapi.entityService.findOne(
      "plugin::users-permissions.role",
      authRole.id,
      { populate: ["permissions"] }
    );
    const action = "api::clinical-intelligence.clinical-intelligence.suggest";
    const hasPermission = role.permissions?.some((p) => p.action === action);
    if (hasPermission) return;
    await strapi.entityService.create(
      "plugin::users-permissions.permission",
      { data: { action, role: role.id } }
    );
    strapi.log.info("clinical-intelligence: permiso suggest asignado a Authenticated");
  } catch (err) {
    strapi.log.warn("clinical-intelligence: no se pudo asignar permiso", err.message);
  }
}

async function ensureCopilotPermission(strapi) {
  try {
    const [authRole] = await strapi.entityService.findMany(
      "plugin::users-permissions.role",
      { filters: { type: "authenticated" } }
    );
    if (!authRole) return;
    const role = await strapi.entityService.findOne(
      "plugin::users-permissions.role",
      authRole.id,
      { populate: ["permissions"] }
    );
    const action = "api::copilot.copilot.suggestions";
    const hasPermission = role.permissions?.some((p) => p.action === action);
    if (hasPermission) return;
    await strapi.entityService.create(
      "plugin::users-permissions.permission",
      { data: { action, role: role.id } }
    );
    strapi.log.info("copilot: permiso suggestions asignado a Authenticated");
  } catch (err) {
    strapi.log.warn("copilot: no se pudo asignar permiso", err.message);
  }
}

module.exports = {
  register(/*{ strapi }*/) {},

  async bootstrap({ strapi }) {
    initSentry(strapi);
    await initialize(strapi);
    await ensureDoctorApplicationPublicPermission(strapi);
    await ensureSearchPermission(strapi);
    registerAuditListeners(strapi);
    registerMediaListeners(strapi);
    registerClinicalListeners(strapi);
    startWorkers(strapi);
    registerNotificationListeners(strapi);
    await runDbIndexMigration(strapi);
    registerSlowQueryMonitor(strapi);
    registerPoolMonitor(strapi);
    initReadReplica(strapi);
    global.strapi = strapi;
    await setupIndexes(strapi);
    registerAnalyticsListeners(strapi);
    await ensureAnalyticsTable();
    await ensureKnowledgeGraphTable();
    registerCopilotListeners(strapi);
    await ensureCopilotPermission(strapi);
    await ensureClinicalIntelligencePermission(strapi);
    await ensureKnowledgeGraphPermission(strapi);
    await ensureMedicalAiPermission(strapi);
    await ensurePredictiveMedicinePermission(strapi);
    if (ai.isEnabled() && process.env.REDIS_URL) {
      const q = require("../modules/jobs/queues").getAiInsightsQueue();
      await q.add("generate", { days: 7 }, { repeat: { pattern: "0 9 * * 1" } }).catch(() => {});
      await startCopilotScheduler();
    }
    if (process.env.CLICKHOUSE_URL && process.env.REDIS_URL) {
      const kgq = getKnowledgeGraphQueue();
      await kgq.add("build", {}, { repeat: { pattern: "0 3 * * 0" } }).catch(() => {});
      const refreshq = getAiModelRefreshQueue();
      await refreshq.add("refresh", {}, { repeat: { pattern: "0 4 * * *" } }).catch(() => {});
    }
    if (process.env.REDIS_URL) {
      const predq = getPredictiveModelRefreshQueue();
      await predq.add("refresh", {}, { repeat: { pattern: "0 5 * * *" } }).catch(() => {});
    }
  },
};
