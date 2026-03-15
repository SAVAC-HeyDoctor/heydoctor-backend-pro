"use strict";

const predictiveMedicine = require("../../../../modules/predictive-medicine");

module.exports = {
  async risk(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized("Autenticación requerida");

    const body = ctx.request?.body ?? {};
    let symptoms = body.symptoms ?? body.data?.attributes?.symptoms ?? [];
    const context = body.context ?? body.data?.attributes?.context ?? {};

    if (!symptoms) {
      return ctx.badRequest("Se requiere symptoms");
    }
    if (typeof symptoms === "string") {
      symptoms = symptoms.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(symptoms)) {
      symptoms = [String(symptoms)];
    }

    const clinicId = ctx.state?.clinicId ?? context.clinic_id ?? null;

    if (!predictiveMedicine.isEnabled()) {
      return ctx.send({
        predicted_conditions: [],
        risk_scores: [],
        preventive_actions: [],
        meta: { engine_enabled: false, message: "Predictive Medicine requiere Medical AI Engine o Clinical Intelligence" },
      });
    }

    const result = await predictiveMedicine.predictHealthRisks(symptoms, clinicId, { limit: 15 });

    const strapi = global.strapi;
    const codeToDesc = {};
    const codes = (result.predicted_conditions ?? []).map((c) => c.code).filter(Boolean);
    if (strapi && codes.length > 0) {
      const cieCodes = await strapi.db.query("api::cie-10-code.cie-10-code").findMany({
        where: { code: { $in: codes } },
        select: ["code", "description"],
      });
      for (const c of cieCodes || []) codeToDesc[c.code] = c.description ?? "";
    }

    const predicted_conditions = (result.predicted_conditions ?? []).map((c) => ({
      code: c.code,
      description: codeToDesc[c.code] ?? "",
      risk_score: c.risk_score,
    }));

    return ctx.send({
      predicted_conditions,
      risk_scores: result.risk_scores ?? [],
      preventive_actions: result.preventive_actions ?? [],
      meta: { engine_enabled: true },
    });
  },
};
