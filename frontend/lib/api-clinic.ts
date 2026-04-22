/**
 * API helpers for clinic-scoped requests (cookies HttpOnly).
 */

import { apiFetch, getApiBase } from './api-client';

export async function fetchPatients(clinicId: number | null) {
  const base = getApiBase();
  const params = clinicId
    ? `?filters[clinic][id][$eq]=${clinicId}`
    : '';
  const res = await apiFetch(`${base}/api/patients${params}`);
  if (!res.ok) throw new Error('Failed to fetch patients');
  return res.json();
}

export async function fetchAppointments(clinicId: number | null) {
  const base = getApiBase();
  const params = clinicId
    ? `?filters[clinic][id][$eq]=${clinicId}`
    : '';
  const res = await apiFetch(`${base}/api/appointments${params}`);
  if (!res.ok) throw new Error('Failed to fetch appointments');
  return res.json();
}

export async function fetchClinicMe() {
  const base = getApiBase();
  const res = await apiFetch(`${base}/api/clinics/me`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

/** Registro médico del paciente (consultas, diagnósticos, tratamientos) */
export async function fetchPatientMedicalRecord(patientId: number | string) {
  const base = getApiBase();
  const res = await apiFetch(
    `${base}/api/patients/${patientId}/medical-record`,
  );
  if (!res.ok) throw new Error('Failed to fetch medical record');
  const json = await res.json();
  return json.data ?? json;
}
