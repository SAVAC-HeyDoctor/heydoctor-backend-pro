/** Structured output from {@link AiService.generateClinicalSummary} (not persisted). */
export type ClinicalSummaryResult = {
  summary: string;
  suggestedDiagnosis: string[];
  improvedNotes: string;
};

/** Asistencia clínica libre (motivo / síntomas / notas), sin persistir. */
export type ConsultationAssistResult = {
  assistiveOnlyNotice: string;
  possibleDiagnoses: string[];
  recommendations: string[];
  generalEducation: string[];
};
