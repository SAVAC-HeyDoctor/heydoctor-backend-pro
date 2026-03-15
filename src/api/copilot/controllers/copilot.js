"use strict";

const cache = require("../../../../modules/ai/copilot/cache");
const copilot = require("../../../../modules/ai/copilot");
const medicalAiEngine = require("../../../../modules/medical-ai-engine");
const predictiveMedicine = require("../../../../modules/predictive-medicine");
const cdss = require("../../../../modules/cdss");
const { ensureClinicAccess } = require("../../../../utils/tenant-scope");
const { enqueueCopilotAnalysis } = require("../../../../modules/jobs/queues");

module.exports = {
  async suggestions(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized("Autenticación requerida");

    const consultationId = ctx.query?.consultationId ?? ctx.query?.consultation_id;
    if (!consultationId) return ctx.badRequest("Se requiere consultationId");

    const strapi = global.strapi;
    if (!strapi) return ctx.internalServerError("Servicio no disponible");

    const apt = await strapi.entityService.findOne("api::appointment.appointment", consultationId, {
      populate: ["clinic"],
    });
    if (!apt) return ctx.notFound("Consulta no encontrada");
    if (!ensureClinicAccess(ctx, apt)) return ctx.forbidden("No tiene acceso a esta consulta");

    if (!copilot.isEnabled()) {
      return ctx.send({
        data: null,
        meta: { ai_enabled: false, message: "AI Copilot no está configurado" },
      });
    }

    let suggestions = await cache.getSuggestions(consultationId);
    if (!suggestions) {
      enqueueCopilotAnalysis({ consultationId, appointmentId: consultationId }).catch(() => {});
      return ctx.send({
        data: null,
        meta: { ai_enabled: true, status: "processing", message: "Análisis en curso, intente de nuevo en unos segundos" },
      });
    }

    if (medicalAiEngine.isEnabled() && suggestions.symptoms_detected?.length > 0) {
      const clinicId = apt.clinic?.id ?? apt.clinic;
      const base = {
        suggested_diagnoses: (suggestions.possible_diagnoses ?? []).map((d) => ({ code: String(d), description: String(d) })),
        suggested_treatments: [],
      };
      suggestions = await medicalAiEngine.enrichSuggestions(suggestions.symptoms_detected, clinicId, {
        ...suggestions,
        ...base,
      });
    }
    if (predictiveMedicine.isEnabled() && suggestions.symptoms_detected?.length > 0) {
      const clinicId = apt.clinic?.id ?? apt.clinic;
      suggestions = await predictiveMedicine.enrichSuggestions(suggestions.symptoms_detected, clinicId, suggestions);
    }
    if (cdss.isEnabled() && suggestions.symptoms_detected?.length > 0) {
      const clinicId = apt.clinic?.id ?? apt.clinic;
      const base = {
        suggested_diagnoses: (suggestions.suggested_diagnoses ?? suggestions.possible_diagnoses ?? []).map((d) =>
          typeof d === "string" ? { code: d, description: d } : d
        ),
        suggested_treatments: suggestions.suggested_treatments ?? [],
      };
      suggestions = await cdss.enrichWithCdss(suggestions.symptoms_detected, clinicId, { ...suggestions, ...base });
    }

    return ctx.send({
      data: suggestions,
      meta: { ai_enabled: true, status: "ready" },
    });
  },
};
