"use strict";

const knowledgeGraph = require("../../../../modules/knowledge-graph");
const { enqueueKnowledgeGraphBuild } = require("../../../../modules/jobs/queues");

module.exports = {
  async build(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized("Autenticación requerida");

    if (!knowledgeGraph.isEnabled()) {
      return ctx.badRequest("Knowledge graph requiere ClickHouse configurado");
    }

    const clinicId = ctx.state?.clinicId ?? ctx.query?.clinic_id ?? null;
    await enqueueKnowledgeGraphBuild({ clinicId });

    return ctx.send({ ok: true, message: "Construcción del grafo encolada" });
  },

  async query(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized("Autenticación requerida");

    const symptoms = ctx.query?.symptoms ?? ctx.query?.symptoms_text ?? "";
    const clinicId = ctx.state?.clinicId ?? null;

    if (!symptoms || typeof symptoms !== "string") {
      return ctx.badRequest("Se requiere el parámetro symptoms");
    }

    const result = await knowledgeGraph.queryKnowledgeGraph(symptoms, clinicId, { limit: 15 });

    const strapi = global.strapi;
    const codeToDesc = {};
    const allCodes = [...(result.diagnoses || []).map((d) => d.code), ...(result.related_conditions || []).map((r) => r.code)].filter(Boolean);
    if (strapi && allCodes.length > 0) {
      const cieCodes = await strapi.db.query("api::cie-10-code.cie-10-code").findMany({
        where: { code: { $in: allCodes } },
        select: ["code", "description"],
      });
      for (const c of cieCodes || []) codeToDesc[c.code] = c.description ?? "";
    }

    const diagnoses = (result.diagnoses || []).map((d) => ({
      code: d.code,
      description: codeToDesc[d.code] ?? "",
      weight: d.weight,
    }));

    const related_conditions = (result.related_conditions || []).map((r) => ({
      code: r.code,
      description: codeToDesc[r.code] ?? "",
      weight: r.weight,
    }));

    return ctx.send({
      diagnoses,
      treatments: result.treatments || [],
      related_conditions,
    });
  },
};
