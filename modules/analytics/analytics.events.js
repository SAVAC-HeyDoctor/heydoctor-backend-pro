"use strict";

/**
 * Listeners de EventBus para analytics.
 * Encola eventos en analytics-worker para inserción en ClickHouse.
 */
const eventBus = require("../events/eventBus");
const analytics = require("./index");

function toEventPayload(payload, defaults = {}) {
  return {
    clinicId: payload.clinicId ?? payload.clinic_id ?? defaults.clinicId,
    userId: payload.userId ?? payload.user_id ?? payload.doctorId ?? payload.patientId ?? defaults.userId,
    entityId: payload.entityId ?? payload.entity_id ?? payload.consultationId ?? payload.appointmentId ?? payload.fileId ?? defaults.entityId,
    metadata: { ...payload },
  };
}

function registerAnalyticsListeners(strapi) {
  if (!analytics.isEnabled()) {
    strapi?.log?.info?.("Analytics: disabled (CLICKHOUSE_URL not set)");
    return;
  }

  eventBus.on("CONSULTATION_STARTED", (payload) => {
    analytics.trackConsultation("consultation_started", toEventPayload(payload));
  });

  eventBus.on("consultation_joined", (payload) => {
    analytics.trackConsultation("consultation_joined", toEventPayload(payload));
  });

  eventBus.on("consultation_ended", (payload) => {
    analytics.trackConsultation("consultation_ended", toEventPayload(payload));
    analytics.trackConsultation("consultation_completed", toEventPayload(payload));
    const ai = require("../ai");
    if (ai.isEnabled()) {
      const { enqueueAiSummary } = require("../jobs/queues");
      enqueueAiSummary({
        appointmentId: payload.appointmentId ?? payload.consultationId,
        clinicId: payload.clinicId,
      });
    }
  });

  eventBus.on("appointment_created", (payload) => {
    analytics.trackAppointment("appointment_created", toEventPayload(payload));
  });

  eventBus.on("appointment_cancelled", (payload) => {
    analytics.trackAppointment("appointment_cancelled", toEventPayload(payload));
  });

  eventBus.on("patient_created", (payload) => {
    analytics.trackEvent("patient_created", toEventPayload(payload));
  });

  eventBus.on("clinical_record_created", (payload) => {
    analytics.trackEvent("clinical_record_created", toEventPayload(payload));
  });

  eventBus.on("document_uploaded", (payload) => {
    analytics.trackEvent("document_uploaded", toEventPayload(payload));
  });

  eventBus.on("login", (payload) => {
    analytics.trackLogin({
      userId: payload.userId,
      clinicId: payload.clinicId,
      success: payload.success,
    });
  });

  eventBus.on("search_performed", (payload) => {
    analytics.trackSearch({
      clinicId: payload.clinicId,
      userId: payload.userId,
      query: payload.query,
      type: payload.type,
      resultCount: payload.resultCount,
      source: payload.source,
    });
  });

  strapi?.log?.info?.("Analytics: EventBus listeners registered");
}

module.exports = { registerAnalyticsListeners };
