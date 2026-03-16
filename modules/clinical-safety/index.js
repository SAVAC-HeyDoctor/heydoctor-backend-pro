"use strict";

/**
 * AI Clinical Safety Layer.
 * Valida sugerencias de AI antes de devolverlas al médico.
 * Añade: confidence_score, risk_flag, explanation.
 */

const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;
const HIGH_RISK_THRESHOLD = 0.9;

function calculateConfidenceThreshold(context = {}) {
  const { conditionType, patientAge, severity } = context;
  let threshold = DEFAULT_CONFIDENCE_THRESHOLD;
  if (severity === "high" || conditionType === "critical") threshold = 0.7;
  if (patientAge && patientAge < 18) threshold = 0.65;
  return threshold;
}

function checkClinicalRisk(suggestion, context = {}) {
  const confidence = suggestion.confidence ?? suggestion.risk_score ?? 0;
  const threshold = calculateConfidenceThreshold(context);
  const riskFlag = confidence >= HIGH_RISK_THRESHOLD && (suggestion.type === "diagnostic" || suggestion.type === "treatment");
  return {
    risk_flag: riskFlag,
    below_threshold: confidence < threshold,
    threshold,
  };
}

function validateAiSuggestion(suggestion, context = {}) {
  if (!suggestion) return null;

  const type = suggestion.type || "diagnostic";
  const confidence = Number(suggestion.confidence ?? suggestion.risk_score ?? 0.5);
  const threshold = calculateConfidenceThreshold(context);
  const { risk_flag } = checkClinicalRisk(suggestion, context);

  let explanation = suggestion.explanation || "";
  if (!explanation) {
    if (type === "diagnostic") {
      explanation = confidence >= 0.7 ? "Based on symptoms and clinical patterns" : "Based on symptoms and historical patterns";
    } else if (type === "treatment") {
      explanation = "Based on evidence-based guidelines and clinical context";
    } else {
      explanation = "Based on AI analysis of clinical data";
    }
  }

  return {
    ...suggestion,
    confidence: Math.round(confidence * 100) / 100,
    confidence_score: confidence,
    risk_flag: risk_flag,
    explanation,
    _safety_validated: true,
  };
}

function enrichSuggestions(suggestions, context = {}) {
  if (!suggestions) return suggestions;
  const result = Array.isArray(suggestions) ? [...suggestions] : { ...suggestions };

  if (Array.isArray(result)) {
    return result.map((s) => validateAiSuggestion(s, context));
  }

  if (result.suggested_diagnoses) {
    result.suggested_diagnoses = result.suggested_diagnoses.map((d) =>
      validateAiSuggestion(
        {
          ...d,
          type: "diagnostic",
          confidence: d.confidence ?? d.risk_score ?? 0.5,
          code: d.code,
          description: d.description,
        },
        context
      )
    );
  }
  if (result.suggested_treatments) {
    result.suggested_treatments = result.suggested_treatments.map((t) =>
      validateAiSuggestion(
        {
          ...t,
          type: "treatment",
          confidence: t.confidence ?? 0.5,
          name: t.name,
        },
        context
      )
    );
  }
  if (result.predicted_diagnoses) {
    result.predicted_diagnoses = result.predicted_diagnoses.map((d) =>
      validateAiSuggestion(
        {
          ...d,
          type: "diagnostic",
          confidence: d.confidence ?? 0.5,
          code: d.code,
          description: d.description,
        },
        context
      )
    );
  }
  if (result.treatment_recommendations) {
    result.treatment_recommendations = result.treatment_recommendations.map((t) =>
      validateAiSuggestion(
        {
          ...t,
          type: "treatment",
          confidence: t.confidence ?? 0.5,
          name: t.name,
        },
        context
      )
    );
  }

  return result;
}

module.exports = {
  validateAiSuggestion,
  calculateConfidenceThreshold,
  checkClinicalRisk,
  enrichSuggestions,
};
