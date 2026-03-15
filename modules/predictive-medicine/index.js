"use strict";

/**
 * Predictive Medicine - plataforma de medicina predictiva basada en datos agregados.
 * RiskScore = weighted(P(d|s), historical_frequency, clinical_patterns)
 */
const medicalAiEngine = require("../medical-ai-engine");
const clinicalIntelligence = require("../clinical-intelligence");
const knowledgeGraph = require("../knowledge-graph");
const analytics = require("../analytics");
const kgClickhouse = require("../knowledge-graph/clickhouse");

const REL = { SYMPTOM_DIAGNOSIS: "symptom_diagnosis" };

const WEIGHTS = {
  ai_confidence: 0.5,
  historical_frequency: 0.3,
  pattern_strength: 0.2,
};

function isEnabled() {
  return medicalAiEngine.isEnabled() || clinicalIntelligence.isEnabled();
}

function symptomsToArray(symptoms) {
  if (Array.isArray(symptoms)) {
    return symptoms.filter((s) => s && typeof s === "string").map((s) => s.toLowerCase().trim()).filter((s) => s.length >= 2);
  }
  if (typeof symptoms === "string") {
    return symptoms.toLowerCase().split(/[\s,;]+/).map((t) => t.trim()).filter((t) => t.length >= 2);
  }
  return [];
}

/**
 * Calcula scores de riesgo para condiciones predichas.
 */
async function calculateRiskScores(symptoms, clinicId = null, options = {}) {
  const symptomsArr = symptomsToArray(symptoms);
  if (!symptomsArr.length) return [];

  const [aiResult, ciResult, patterns] = await Promise.all([
    medicalAiEngine.isEnabled() ? medicalAiEngine.predictFromSymptoms(symptomsArr, clinicId, { limit: 15 }) : null,
    clinicalIntelligence.isEnabled() ? clinicalIntelligence.analyzeSymptoms(symptomsArr.join(" "), clinicId) : null,
    knowledgeGraph.isEnabled() ? getPatternStrengths(symptomsArr, clinicId) : {},
  ]);

  const riskScores = [];
  const seen = new Set();

  const aiDiagnoses = aiResult?.predicted_diagnoses ?? [];
  const ciDiagnostics = ciResult?.top_diagnostics ?? [];
  const patternMap = patterns.diagnosis ?? {};

  for (const d of aiDiagnoses) {
    const code = d.code;
    if (!code || seen.has(code)) continue;
    seen.add(code);

    const aiConf = d.confidence ?? 0;
    const ciMatch = ciDiagnostics.find((c) => (c.code ?? "").toLowerCase() === code.toLowerCase());
    const histFreq = ciMatch ? Math.min(1, (ciMatch.count ?? 0) / 50) : 0;
    const patternStr = patternMap[code] ?? 0;

    const riskScore =
      WEIGHTS.ai_confidence * aiConf +
      WEIGHTS.historical_frequency * histFreq +
      WEIGHTS.pattern_strength * patternStr;

    riskScores.push({
      code,
      risk_score: Math.min(1, riskScore),
      components: { ai_confidence: aiConf, historical_frequency: histFreq, pattern_strength: patternStr },
    });
  }

  for (const c of ciDiagnostics) {
    const code = c.code ?? "";
    if (!code || seen.has(code)) continue;
    seen.add(code);

    const histFreq = Math.min(1, (c.count ?? 0) / 50);
    const aiMatch = aiDiagnoses.find((a) => (a.code ?? "").toLowerCase() === code.toLowerCase());
    const aiConf = aiMatch?.confidence ?? 0;
    const patternStr = patternMap[code] ?? 0;

    const riskScore =
      WEIGHTS.ai_confidence * aiConf +
      WEIGHTS.historical_frequency * histFreq +
      WEIGHTS.pattern_strength * patternStr;

    riskScores.push({
      code,
      risk_score: Math.min(1, riskScore),
      components: { ai_confidence: aiConf, historical_frequency: histFreq, pattern_strength: patternStr },
    });
  }

  return riskScores.sort((a, b) => b.risk_score - a.risk_score).slice(0, options.limit ?? 15);
}

async function getPatternStrengths(symptomsArr, clinicId) {
  if (!knowledgeGraph.isEnabled()) return { diagnosis: {} };
  const nodes = symptomsArr.map((s) => `symptom:${s.replace(/\s+/g, "_")}`);
  const rows = await kgClickhouse.aggregateByTarget(nodes, REL.SYMPTOM_DIAGNOSIS, clinicId, 20);
  const total = rows.reduce((s, r) => s + Number(r.total_weight ?? 0), 0);
  const diagnosis = {};
  for (const r of rows) {
    const code = (r.target_node ?? "").replace("diagnosis:", "");
    if (code) diagnosis[code] = total > 0 ? Math.min(1, Number(r.total_weight ?? 0) / total) : 0;
  }
  return { diagnosis };
}

/**
 * Predice riesgos de salud dado síntomas.
 */
async function predictHealthRisks(symptoms, clinicId = null, options = {}) {
  const riskScores = await calculateRiskScores(symptoms, clinicId, options);
  const conditions = riskScores.map((r) => ({ code: r.code, risk_score: r.risk_score }));

  const symptomsArr = symptomsToArray(symptoms);
  let treatments = [];
  if (medicalAiEngine.isEnabled() && symptomsArr.length > 0) {
    const aiResult = await medicalAiEngine.predictFromSymptoms(symptomsArr, clinicId, { limit: 10 });
    treatments = (aiResult.suggested_treatments ?? []).map((t) => ({
      name: t.name,
      confidence: t.confidence,
      type: "treatment",
    }));
  }

  const preventiveActions = await generatePreventiveRecommendations(conditions, clinicId, options);

  return {
    predicted_conditions: conditions,
    risk_scores: riskScores,
    preventive_actions: preventiveActions,
    suggested_treatments: treatments,
  };
}

/**
 * Detecta patrones clínicos agregados.
 */
async function detectClinicalPatterns(clinicId = null, options = {}) {
  const days = options.days ?? 30;
  const results = { symptom_clusters: [], recurrent_diagnoses: [], clinic_trends: [] };

  if (analytics.isEnabled()) {
    const c = analytics.getClient();
    try {
      const clinicFilter = clinicId != null ? `clinic_id = ${Number(clinicId)} AND ` : "";
      const trendQ = `SELECT toDate(timestamp) as day, event_type, count() as cnt
        FROM events WHERE ${clinicFilter}timestamp >= now() - INTERVAL ${days} DAY
        GROUP BY day, event_type ORDER BY day DESC LIMIT 100`;
      const trendRes = await c.query({ query: trendQ, format: "JSONEachRow" });
      const trendRows = await trendRes.json();
      results.clinic_trends = (Array.isArray(trendRows) ? trendRows : []).slice(0, 20);
    } catch (err) {
      if (global.strapi?.log) global.strapi.log.warn("Predictive medicine: trends query failed", err?.message);
    }
  }

  if (knowledgeGraph.isEnabled() && analytics.isEnabled()) {
    const c = analytics.getClient();
    if (!c) return results;
    try {
      const clinicFilter = clinicId != null ? `AND clinic_id = ${Number(clinicId)}` : "";
      const diagQ = `SELECT target_node, sum(weight) as total
        FROM ${kgClickhouse.TABLE_NAME}
        WHERE relationship_type = 'symptom_diagnosis' ${clinicFilter}
        GROUP BY target_node ORDER BY total DESC LIMIT 20`;
      const diagRes = await c.query({ query: diagQ, format: "JSONEachRow" });
      const diagRows = await diagRes.json();
      results.recurrent_diagnoses = (Array.isArray(diagRows) ? diagRows : []).map((r) => ({
        code: (r.target_node ?? "").replace("diagnosis:", ""),
        frequency: Number(r.total ?? 0),
      }));

      const clusterQ = `SELECT source_node, count() as target_count, sum(weight) as total_weight
        FROM ${kgClickhouse.TABLE_NAME}
        WHERE relationship_type = 'symptom_diagnosis' ${clinicFilter}
        GROUP BY source_node ORDER BY total_weight DESC LIMIT 30`;
      const clusterRes = await c.query({ query: clusterQ, format: "JSONEachRow" });
      const clusterRows = await clusterRes.json();
      results.symptom_clusters = (Array.isArray(clusterRows) ? clusterRows : []).map((r) => ({
        symptom: (r.source_node ?? "").replace("symptom:", ""),
        linked_diagnoses: Number(r.target_count ?? 0),
        weight: Number(r.total_weight ?? 0),
      }));
    } catch (err) {
      if (global.strapi?.log) global.strapi.log.warn("Predictive medicine: patterns query failed", err?.message);
    }
  }

  return results;
}

/**
 * Genera recomendaciones preventivas basadas en condiciones predichas.
 */
async function generatePreventiveRecommendations(predictedConditions, clinicId = null, options = {}) {
  const actions = [];
  const topConditions = (predictedConditions ?? []).slice(0, 5);

  for (const c of topConditions) {
    const risk = c.risk_score ?? 0;
    if (risk >= 0.3) {
      actions.push({
        condition_code: c.code,
        risk_level: risk >= 0.6 ? "moderate" : "low",
        recommendation: `Considerar seguimiento para condición asociada (CIE: ${c.code})`,
        type: "follow_up",
      });
    }
  }

  if (topConditions.length > 0) {
    actions.push({
      condition_code: null,
      risk_level: "general",
      recommendation: "Realizar historia clínica completa y revisión de antecedentes",
      type: "screening",
    });
  }

  return actions.slice(0, options.limit ?? 10);
}

/**
 * Enriquece sugerencias de otros módulos.
 */
async function enrichSuggestions(symptoms, clinicId, baseResult = {}) {
  if (!isEnabled()) return baseResult;

  const predResult = await predictHealthRisks(symptoms, clinicId, { limit: 8 });
  const conditions = predResult.predicted_conditions ?? [];
  const preventiveActions = predResult.preventive_actions ?? [];

  const existingCodes = new Set((baseResult.suggested_diagnoses ?? baseResult.predictions ?? []).map((d) => d.code));
  for (const c of conditions) {
    if (c.code && !existingCodes.has(c.code)) {
      baseResult.suggested_diagnoses = baseResult.suggested_diagnoses ?? [];
      baseResult.suggested_diagnoses.push({
        code: c.code,
        risk_score: c.risk_score,
        source: "predictive_medicine",
      });
      existingCodes.add(c.code);
    }
  }

  if (preventiveActions.length > 0) {
    baseResult.preventive_actions = preventiveActions;
  }

  return baseResult;
}

module.exports = {
  isEnabled,
  calculateRiskScores,
  predictHealthRisks,
  detectClinicalPatterns,
  generatePreventiveRecommendations,
  enrichSuggestions,
};
