"use strict";

const cdss = require("../../../../modules/cdss");

module.exports = {
  async evaluate(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized("Autenticación requerida");

    const body = ctx.request?.body ?? {};
    let symptoms = body.symptoms ?? body.data?.attributes?.symptoms ?? [];
    const context = body.context ?? body.data?.attributes?.context ?? {};

    if (typeof symptoms === "string") {
      symptoms = symptoms.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(symptoms)) {
      symptoms = symptoms ? [String(symptoms)] : [];
    }

    const clinicId = ctx.state?.clinicId ?? context.clinic_id ?? context.clinicId ?? null;

    if (!cdss.isEnabled()) {
      return ctx.send({
        alerts: [],
        suggested_diagnoses: [],
        treatment_recommendations: [],
        preventive_actions: [],
        risk_levels: [],
        meta: { cdss_enabled: false, message: "CDSS requiere al menos Medical AI Engine, Predictive Medicine o Clinical Intelligence" },
      });
    }

    const result = await cdss.evaluate(
      { symptoms, context: { ...context, clinic_id: clinicId } },
      clinicId,
      { emitEvent: true }
    );

    const strapi = global.strapi;
    const codeToDesc = {};
    const codes = (result.suggested_diagnoses ?? []).map((d) => d.code).filter(Boolean);
    if (strapi && codes.length > 0) {
      const cieCodes = await strapi.db.query("api::cie-10-code.cie-10-code").findMany({
        where: { code: { $in: codes } },
        select: ["code", "description"],
      });
      for (const c of cieCodes || []) codeToDesc[c.code] = c.description ?? "";
    }

    const suggested_diagnoses = (result.suggested_diagnoses ?? []).map((d) => ({
      ...d,
      description: d.description || codeToDesc[d.code] || "",
    }));

    return ctx.send({
      alerts: result.alerts ?? [],
      suggested_diagnoses,
      treatment_recommendations: result.treatment_recommendations ?? [],
      preventive_actions: result.preventive_actions ?? [],
      risk_levels: result.risk_levels ?? [],
      meta: { ...(result.meta ?? {}), cdss_enabled: true },
    });
  },
};
