"use strict";

const clinicalIntelligence = require("../../../../modules/clinical-intelligence");
const knowledgeGraph = require("../../../../modules/knowledge-graph");
const medicalAiEngine = require("../../../../modules/medical-ai-engine");
const predictiveMedicine = require("../../../../modules/predictive-medicine");

module.exports = {
  async suggest(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized("Autenticación requerida");

    const symptoms = ctx.query?.symptoms ?? ctx.query?.symptoms_text ?? "";
    const clinicId = ctx.state?.clinicId ?? null;

    if (!symptoms || typeof symptoms !== "string") {
      return ctx.badRequest("Se requiere el parámetro symptoms");
    }

    const [suggestedDiagnoses, suggestedTreatments] = await Promise.all([
      clinicalIntelligence.suggestDiagnoses(symptoms, clinicId, 15),
      clinicalIntelligence.suggestTreatments(symptoms, clinicId, 15),
    ]);

    let result = {
      suggested_diagnoses: suggestedDiagnoses,
      suggested_treatments: suggestedTreatments,
    };

    if (knowledgeGraph.isEnabled()) {
      result = await knowledgeGraph.enrichClinicalSuggestions(symptoms, clinicId, result);
    }
    if (medicalAiEngine.isEnabled()) {
      const symptomsArr = typeof symptoms === "string" ? symptoms.split(/[\s,;]+/).filter(Boolean) : [symptoms];
      result = await medicalAiEngine.enrichSuggestions(symptomsArr.length ? symptomsArr : [symptoms], clinicId, result);
    }
    if (predictiveMedicine.isEnabled()) {
      const symptomsArr = typeof symptoms === "string" ? symptoms.split(/[\s,;]+/).filter(Boolean) : [symptoms];
      result = await predictiveMedicine.enrichSuggestions(symptomsArr.length ? symptomsArr : [symptoms], clinicId, result);
    }

    return ctx.send(result);
  },
};
