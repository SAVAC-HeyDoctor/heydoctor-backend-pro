"use strict";

/**
 * Medical Compliance Base.
 * Registra eventos de decisiones clínicas y AI para auditoría.
 * Almacena en ClickHouse analytics y PostgreSQL audit_log.
 */
const analytics = require("../analytics");
const eventBus = require("../events/eventBus");

const AUDIT_ACTIONS = ["clinical_decision_made", "diagnostic_confirmed", "treatment_applied"];

async function persistToAuditLog(eventType, payload) {
  const strapi = global.strapi;
  if (!strapi || !AUDIT_ACTIONS.includes(eventType)) return;
  try {
    const path = require("path");
    const { auditLogger } = require(path.join(process.cwd(), "src", "utils", "audit-logger"));
    await auditLogger(
      strapi,
      eventType,
      { state: { user: payload.userId ? { id: payload.userId } : null }, request: payload.ctx?.request ?? {} },
      {
        patient_id: payload.patientId ?? payload.patient_id,
        clinic_id: payload.clinicId ?? payload.clinic_id,
        consultationId: payload.consultationId,
        diagnosticId: payload.diagnosticId,
        ...payload,
      }
    );
  } catch (err) {
    strapi?.log?.warn?.("Compliance: audit log failed", err?.message);
  }
}

function logEvent(eventType, payload = {}) {
  if (analytics.isEnabled()) {
    analytics.trackEvent(eventType, {
      clinicId: payload.clinicId ?? payload.clinic_id ?? null,
      userId: payload.userId ?? payload.doctorId ?? payload.user_id ?? null,
      entityId: payload.entityId ?? payload.consultationId ?? payload.appointmentId ?? payload.diagnosticId ?? null,
      metadata: payload,
    });
  }
  eventBus.emit("compliance_log", { eventType, payload });
  persistToAuditLog(eventType, payload).catch(() => {});
}

function logClinicalDecision(payload) {
  logEvent("clinical_decision_made", payload);
}

function logAiRecommendationViewed(payload) {
  logEvent("ai_recommendation_viewed", payload);
}

function logDiagnosticConfirmed(payload) {
  logEvent("diagnostic_confirmed", payload);
}

function logTreatmentApplied(payload) {
  logEvent("treatment_applied", payload);
}

module.exports = {
  logEvent,
  logClinicalDecision,
  logAiRecommendationViewed,
  logDiagnosticConfirmed,
  logTreatmentApplied,
};
