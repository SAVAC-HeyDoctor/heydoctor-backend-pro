/**
 * API client para capacidades de AI, CDSS y Predictive Medicine.
 * Integración con el backend HeyDoctor.
 */

const getAuthHeaders = () => {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('jwt') || localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getApiBase = () =>
  (typeof window !== 'undefined' && (window as any).__API_URL__) ||
  process.env.NEXT_PUBLIC_API_URL ||
  '';

const jsonHeaders = () => ({
  ...getAuthHeaders(),
  'Content-Type': 'application/json',
});

/** Copilot: sugerencias durante consulta activa */
export async function fetchCopilotSuggestions(consultationId: number | string) {
  const base = getApiBase();
  const res = await fetch(
    `${base}/api/copilot/suggestions?consultationId=${consultationId}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error('Failed to fetch copilot suggestions');
  return res.json();
}

/** CDSS: evaluación clínica completa */
export async function evaluateCdss(symptoms: string[], context?: Record<string, unknown>) {
  const base = getApiBase();
  const res = await fetch(`${base}/api/cdss/evaluate`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ symptoms, context: context ?? {} }),
  });
  if (!res.ok) throw new Error('Failed to evaluate CDSS');
  return res.json();
}

/** Predictive Medicine: riesgos y acciones preventivas */
export async function fetchPredictiveRisk(symptoms: string[], context?: Record<string, unknown>) {
  const base = getApiBase();
  const res = await fetch(`${base}/api/predictive-medicine/risk`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ symptoms, context: context ?? {} }),
  });
  if (!res.ok) throw new Error('Failed to fetch predictive risk');
  return res.json();
}

/** Clinical Intelligence: sugerencias basadas en datos históricos */
export async function fetchClinicalSuggestions(symptoms: string) {
  const base = getApiBase();
  const res = await fetch(
    `${base}/api/clinical-intelligence/suggest?symptoms=${encodeURIComponent(symptoms)}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error('Failed to fetch clinical suggestions');
  return res.json();
}

/** Búsqueda médica global (patients, doctors, diagnostics) */
export async function searchMedical(
  query: string,
  type: 'patient' | 'doctor' | 'diagnostic' = 'patient'
) {
  const base = getApiBase();
  const res = await fetch(
    `${base}/api/search?q=${encodeURIComponent(query)}&type=${type}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error('Failed to search');
  return res.json();
}

/** Generar nota clínica (Chief Complaint, HPI, Assessment, Plan) */
export async function generateClinicalNote(params: {
  consultationId?: number | string;
  symptoms?: string[];
  clinicalNotes?: string;
  patientHistory?: Record<string, unknown>;
  messages?: Array<{ role: string; content: string }>;
}) {
  const base = getApiBase();
  const res = await fetch(`${base}/api/copilot/generate-clinical-note`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      consultationId: params.consultationId,
      consultation_id: params.consultationId,
      symptoms: params.symptoms ?? [],
      clinical_notes: params.clinicalNotes,
      patient_history: params.patientHistory,
      messages: params.messages ?? [],
    }),
  });
  if (!res.ok) throw new Error('Failed to generate clinical note');
  return res.json();
}

/** Sugerencias de tratamiento por diagnóstico (CDSS + Predictive Medicine) */
export async function fetchTreatmentSuggestions(
  diagnosisCodeOrDescription: string,
  context?: Record<string, unknown>
) {
  const symptoms = [diagnosisCodeOrDescription];
  const [cdssRes, predRes] = await Promise.all([
    evaluateCdss(symptoms, context),
    fetchPredictiveRisk(symptoms, context),
  ]);
  return {
    treatment_recommendations: cdssRes?.treatment_recommendations ?? [],
    preventive_actions: [
      ...(cdssRes?.preventive_actions ?? []),
      ...(predRes?.preventive_actions ?? []),
    ],
  };
}
