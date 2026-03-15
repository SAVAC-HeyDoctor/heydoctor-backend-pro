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

module.exports = {
  register(/*{ strapi }*/) {},

  async bootstrap({ strapi }) {
    initSentry(strapi);
    await initialize(strapi);
    await ensureDoctorApplicationPublicPermission(strapi);
    registerAuditListeners(strapi);
    registerMediaListeners(strapi);
    registerClinicalListeners(strapi);
    startWorkers(strapi);
    registerNotificationListeners(strapi);
    await runDbIndexMigration(strapi);
    registerSlowQueryMonitor(strapi);
    registerPoolMonitor(strapi);
    initReadReplica(strapi);
  },
};
