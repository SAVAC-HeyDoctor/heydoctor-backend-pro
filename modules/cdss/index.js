"use strict";

/**
 * Clinical Decision Support System (CDSS) - integra todas las capacidades de inteligencia clínica.
 */
const medicalAiEngine = require("../medical-ai-engine");
const predictiveMedicine = require("../predictive-medicine");
const clinicalIntelligence = require("../clinical-intelligence");
const knowledgeGraph = require("../knowledge-graph");
const analytics = require("../analytics");
const eventBus = require("../events/eventBus");

const ALERT_TYPES = {
  DIAGNOSTIC: "diagnostic_alert",
  RISK: "risk_alert",
  TREATMENT: "treatment_alert",
  PREVENTIVE: "preventive_alert",
};

function isEnabled() {
  return medicalAiEngine.isEnabled() || predictiveMedicine.isEnabled() || clinicalIntelligence.isEnabled();
}

function symptomsToArray(symptoms) {
  if (Array.isArray(symptoms)) {
    return symptoms.filter((s) => s && typeof s === "string").map((s) => String(s).toLowerCase().trim()).filter((s) => s.length >= 2);
  }
  if (typeof symptoms === "string") {
    return symptoms.toLowerCase().split(/[\s,;]+/).map((t) => t.trim()).filter((t) => t.length >= 2);
  }
  return [];
}

/**
 * Analiza el contexto clínico de entrada.
 */
function analyzeClinicalContext(input = {}) {
  const symptoms = symptomsToArray(input.symptoms ?? input.symptom_text ?? []);
  const context = input.context ?? {};
  const clinicalRecord = input.clinical_record ?? null;
  const diagnostics = input.diagnostics ?? [];
  const treatments = input.treatments ?? [];
  const patientContext = {
    age: context.age ?? context.edad ?? null,
    gender: context.gender ?? context.sexo ?? context.genero ?? null,
  };
  return {
    symptoms,
    context,
    clinicalRecord,
    diagnostics,
    treatments,
    patientContext,
    clinicId: context.clinic_id ?? context.clinicId ?? null,
  };
}

/**
 * Genera alertas clínicas a partir de los resultados.
 */
function generateClinicalAlerts(aiResult, predResult, ciResult, kgResult) {
  const alerts = [];

  const aiDiagnoses = aiResult?.predicted_diagnoses ?? [];
  const predConditions = predResult?.predicted_conditions ?? predResult?.risk_scores ?? [];
  const ciDiagnostics = ciResult?.top_diagnostics ?? [];
  const predActions = predResult?.preventive_actions ?? [];
  const aiTreatments = aiResult?.suggested_treatments ?? [];

  for (const d of aiDiagnoses) {
    const conf = d.confidence ?? 0;
    if (conf >= 0.5) {
      alerts.push({
        type: ALERT_TYPES.DIAGNOSTIC,
        severity: conf >= 0.7 ? "high" : "medium",
        message: `High probability of ${d.code} based on symptoms (confidence: ${(conf * 100).toFixed(0)}%)`,
        code: d.code,
        confidence: conf,
      });
    }
  }

  for (const r of predConditions) {
    const risk = r.risk_score ?? r.riskScore ?? 0;
    if (risk >= 0.5) {
      alerts.push({
        type: ALERT_TYPES.RISK,
        severity: risk >= 0.7 ? "high" : "medium",
        message: `Elevated risk for condition ${r.code ?? "associated"} (risk score: ${(risk * 100).toFixed(0)}%)`,
        code: r.code,
        risk_score: risk,
      });
    }
  }

  for (const t of aiTreatments) {
    const conf = t.confidence ?? 0;
    if (conf >= 0.4) {
      alerts.push({
        type: ALERT_TYPES.TREATMENT,
        severity: "info",
        message: `Treatment ${t.name ?? ""} frequently associated with symptoms (confidence: ${(conf * 100).toFixed(0)}%)`,
        treatment: t.name,
        confidence: conf,
      });
    }
  }

  for (const a of predActions) {
    if (a.risk_level === "moderate" || a.risk_level === "high") {
      alerts.push({
        type: ALERT_TYPES.PREVENTIVE,
        severity: a.risk_level === "high" ? "high" : "medium",
        message: a.recommendation ?? "Consider preventive follow-up",
        condition_code: a.condition_code,
        action_type: a.type ?? "follow_up",
      });
    }
  }

  return alerts.sort((a, b) => {
    const sev = { high: 3, medium: 2, info: 1 };
    return (sev[b.severity] ?? 0) - (sev[a.severity] ?? 0);
  });
}

/**
 * Genera recomendaciones de tratamiento.
 */
function generateTreatmentRecommendations(aiResult, predResult, ciResult) {
  const seen = new Set();
  const recs = [];

  const sources = [
    ...(aiResult?.suggested_treatments ?? []).map((t) => ({ ...t, source: "medical_ai_engine" })),
    ...(predResult?.suggested_treatments ?? []).map((t) => ({ ...t, source: "predictive_medicine" })),
    ...(ciResult?.top_treatments ?? []).map((t) => ({ name: t.name, confidence: Math.min(1, (t.count ?? 0) / 20), source: "clinical_intelligence" })),
  ];

  for (const t of sources) {
    const name = (t.name ?? "").trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      recs.push({
        name,
        confidence: t.confidence ?? 0.5,
        source: t.source ?? "cdss",
      });
    }
  }

  return recs.sort((a, b) => b.confidence - a.confidence).slice(0, 15);
}

/**
 * Evalúa niveles de riesgo.
 */
function evaluateRiskLevels(predResult) {
  const riskLevels = (predResult?.risk_scores ?? predResult?.predicted_conditions ?? []).map((r) => ({
    code: r.code,
    risk_score: r.risk_score ?? r.riskScore ?? 0,
    level: (r.risk_score ?? r.riskScore ?? 0) >= 0.7 ? "high" : (r.risk_score ?? r.riskScore ?? 0) >= 0.4 ? "medium" : "low",
    components: r.components ?? {},
  }));
  return riskLevels.sort((a, b) => b.risk_score - a.risk_score);
}

/**
 * Genera guía clínica completa (orquestación principal).
 */
async function generateClinicalGuidance(input, clinicId = null) {
  const ctx = analyzeClinicalContext(input);
  const symptoms = ctx.symptoms;
  const effectiveClinicId = ctx.clinicId ?? clinicId;

  if (symptoms.length === 0 && !ctx.diagnostics?.length) {
    return {
      alerts: [],
      suggested_diagnoses: [],
      treatment_recommendations: [],
      preventive_actions: [],
      risk_levels: [],
      meta: { has_context: false },
    };
  }

  const symptomText = symptoms.join(" ");
  const [aiResult, predResult, ciResult, kgResult] = await Promise.all([
    medicalAiEngine.isEnabled() ? medicalAiEngine.predictFromSymptoms(symptoms, effectiveClinicId, { limit: 15 }) : null,
    predictiveMedicine.isEnabled() ? predictiveMedicine.predictHealthRisks(symptoms, effectiveClinicId, { limit: 15 }) : null,
    clinicalIntelligence.isEnabled() ? clinicalIntelligence.analyzeSymptoms(symptomText, effectiveClinicId) : null,
    knowledgeGraph.isEnabled() ? knowledgeGraph.queryKnowledgeGraph(symptomText, effectiveClinicId, { limit: 10 }) : null,
  ]);

  const suggested_diagnoses = [];
  const seen = new Set();

  for (const d of [...(aiResult?.predicted_diagnoses ?? []), ...(kgResult?.diagnoses ?? []), ...(kgResult?.related_conditions ?? [])]) {
    const code = d.code ?? (d.target_node ?? "").replace("diagnosis:", "");
    if (code && !seen.has(code)) {
      seen.add(code);
      suggested_diagnoses.push({
        code,
        confidence: d.confidence ?? d.weight ?? 0,
        description: d.description ?? "",
        source: d.source ?? "cdss",
      });
    }
  }

  for (const c of ciResult?.top_diagnostics ?? []) {
    const code = c.code ?? "";
    if (code && !seen.has(code)) {
      seen.add(code);
      suggested_diagnoses.push({
        code,
        confidence: Math.min(1, (c.count ?? 0) / 50),
        description: c.description ?? "",
        source: "clinical_intelligence",
      });
    }
  }

  if (predResult?.predicted_conditions) {
    for (const c of predResult.predicted_conditions) {
      if (c.code && !seen.has(c.code)) {
        seen.add(c.code);
        suggested_diagnoses.push({
          code: c.code,
          confidence: c.risk_score ?? 0,
          description: "",
          source: "predictive_medicine",
        });
      }
    }
  }

  const alerts = generateClinicalAlerts(aiResult, predResult, ciResult, kgResult);
  const treatment_recommendations = generateTreatmentRecommendations(aiResult, predResult, ciResult);
  const preventive_actions = predResult?.preventive_actions ?? [];
  const risk_levels = evaluateRiskLevels(predResult);

  return {
    alerts,
    suggested_diagnoses: suggested_diagnoses.sort((a, b) => b.confidence - a.confidence).slice(0, 15),
    treatment_recommendations,
    preventive_actions,
    risk_levels,
    meta: {
      sources_used: {
        medical_ai_engine: !!medicalAiEngine.isEnabled(),
        predictive_medicine: !!predictiveMedicine.isEnabled(),
        clinical_intelligence: !!clinicalIntelligence.isEnabled(),
        knowledge_graph: !!knowledgeGraph.isEnabled(),
      },
    },
  };
}

/**
 * Evaluación principal del CDSS.
 */
async function evaluate(input, clinicId = null, options = {}) {
  const result = await generateClinicalGuidance(input, clinicId);

  if (options.emitEvent !== false && analytics.isEnabled()) {
    const ctx = analyzeClinicalContext(input);
    analytics.trackEvent("cdss_evaluated", {
      clinicId: ctx.clinicId ?? clinicId,
      metadata: {
        symptoms_count: ctx.symptoms.length,
        alerts_count: result.alerts.length,
        diagnoses_count: result.suggested_diagnoses.length,
        treatments_count: result.treatment_recommendations.length,
      },
    });
    eventBus.emit("cdss_evaluated", {
      clinicId: ctx.clinicId ?? clinicId,
      result: {
        alerts_count: result.alerts.length,
        diagnoses_count: result.suggested_diagnoses.length,
      },
    });
  }

  return result;
}

/**
 * Enriquece sugerencias de otros módulos con evaluación CDSS completa.
 */
async function enrichWithCdss(symptoms, clinicId, baseResult = {}) {
  if (!isEnabled()) return baseResult;

  const input = { symptoms: Array.isArray(symptoms) ? symptoms : [symptoms], context: { clinic_id: clinicId } };
  const cdssResult = await evaluate(input, clinicId, { emitEvent: false });

  baseResult.alerts = cdssResult.alerts ?? [];
  baseResult.risk_levels = cdssResult.risk_levels ?? [];
  if ((cdssResult.preventive_actions ?? []).length > 0) {
    baseResult.preventive_actions = cdssResult.preventive_actions;
  }
  const existingCodes = new Set((baseResult.suggested_diagnoses ?? []).map((d) => d.code));
  for (const d of cdssResult.suggested_diagnoses ?? []) {
    if (d.code && !existingCodes.has(d.code)) {
      baseResult.suggested_diagnoses = baseResult.suggested_diagnoses ?? [];
      baseResult.suggested_diagnoses.push({ ...d, source: d.source ?? "cdss" });
      existingCodes.add(d.code);
    }
  }
  const existingTreatments = new Set((baseResult.suggested_treatments ?? []).map((t) => String(t.name ?? "").toLowerCase()));
  for (const t of cdssResult.treatment_recommendations ?? []) {
    const name = (t.name ?? "").trim();
    if (name && !existingTreatments.has(name.toLowerCase())) {
      baseResult.suggested_treatments = baseResult.suggested_treatments ?? [];
      baseResult.suggested_treatments.push({ name, confidence: t.confidence, source: "cdss" });
      existingTreatments.add(name.toLowerCase());
    }
  }

  return baseResult;
}

module.exports = {
  isEnabled,
  ALERT_TYPES,
  analyzeClinicalContext,
  generateClinicalAlerts,
  generateTreatmentRecommendations,
  evaluateRiskLevels,
  generateClinicalGuidance,
  evaluate,
  enrichWithCdss,
};
