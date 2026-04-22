/**
 * API client para capacidades de AI, CDSS y Predictive Medicine.
 * Integración con el backend HeyDoctor.
 */

import { getApiBase, jsonHeaders } from './api-client';
import { apiFetchWithRefresh } from './session-fetch';

/** Copilot: sugerencias durante consulta activa */
export async function fetchCopilotSuggestions(consultationId: number | string) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(
    `${base}/api/copilot/suggestions?consultationId=${consultationId}`,
  );
  if (!res.ok) throw new Error('Failed to fetch copilot suggestions');
  return res.json();
}

/** CDSS: evaluación clínica completa */
export async function evaluateCdss(symptoms: string[], context?: Record<string, unknown>) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/cdss/evaluate`, {
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
  const res = await apiFetchWithRefresh(`${base}/api/predictive-medicine/risk`, {
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
  const res = await apiFetchWithRefresh(
    `${base}/api/clinical-intelligence/suggest?symptoms=${encodeURIComponent(symptoms)}`,
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
  const res = await apiFetchWithRefresh(
    `${base}/api/search?q=${encodeURIComponent(query)}&type=${type}`,
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
  const res = await apiFetchWithRefresh(`${base}/api/copilot/generate-clinical-note`, {
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

/** Lab Orders: crear orden, listar por paciente, sugerir exámenes */
export async function createLabOrder(data: {
  patient: number;
  doctor?: number;
  diagnosis_code?: string;
  lab_tests: string[];
  status?: string;
  appointment?: number;
}) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/lab-orders`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error('Failed to create lab order');
  return res.json();
}

export async function fetchLabOrdersByPatient(patientId: number | string) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/lab-orders/patient/${patientId}`);
  if (!res.ok) throw new Error('Failed to fetch lab orders');
  return res.json();
}

export async function suggestLabTests(diagnosis?: string) {
  const base = getApiBase();
  const q = diagnosis ? `?diagnosis=${encodeURIComponent(diagnosis)}` : '';
  const res = await apiFetchWithRefresh(`${base}/api/lab-orders/suggest-tests${q}`);
  if (!res.ok) throw new Error('Failed to suggest lab tests');
  return res.json();
}

/** Prescriptions: crear receta, listar por paciente, sugerir medicamentos */
export async function createPrescription(data: {
  patient: number;
  doctor?: number;
  medications: Array<{ name: string } | string>;
  dosage?: string;
  instructions?: string;
  appointment?: number;
}) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/prescriptions`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error('Failed to create prescription');
  return res.json();
}

export async function fetchPrescriptionsByPatient(patientId: number | string) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/prescriptions/patient/${patientId}`);
  if (!res.ok) throw new Error('Failed to fetch prescriptions');
  return res.json();
}

export async function suggestMedications(diagnosis?: string) {
  const base = getApiBase();
  const q = diagnosis ? `?diagnosis=${encodeURIComponent(diagnosis)}` : '';
  const res = await apiFetchWithRefresh(`${base}/api/prescriptions/suggest-medications${q}`);
  if (!res.ok) throw new Error('Failed to suggest medications');
  return res.json();
}

/** Clinical Insights: insights clínicos del paciente */
export async function fetchClinicalInsights(patientId: number | string, symptoms?: string[]) {
  const base = getApiBase();
  const q = symptoms?.length ? `?symptoms=${symptoms.map(encodeURIComponent).join(',')}` : '';
  const res = await apiFetchWithRefresh(`${base}/api/clinical-insight/patient/${patientId}${q}`);
  if (!res.ok) throw new Error('Failed to fetch clinical insights');
  return res.json();
}

/** Clinical Apps: lista de apps disponibles para la clínica */
export async function fetchClinicalApps(clinicId?: number | null) {
  const base = getApiBase();
  const q = clinicId != null ? `?clinicId=${clinicId}` : '';
  const res = await apiFetchWithRefresh(`${base}/api/clinical-apps${q}`);
  if (!res.ok) throw new Error('Failed to fetch clinical apps');
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
