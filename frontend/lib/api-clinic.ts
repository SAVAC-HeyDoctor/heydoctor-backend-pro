/**
 * API helpers for clinic-scoped requests.
 * Include clinic_id in filters when backend requires it.
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

export async function fetchPatients(clinicId: number | null) {
  const base = getApiBase();
  const params = clinicId
    ? `?filters[clinic][id][$eq]=${clinicId}`
    : '';
  const res = await fetch(`${base}/api/patients${params}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch patients');
  return res.json();
}

export async function fetchAppointments(clinicId: number | null) {
  const base = getApiBase();
  const params = clinicId
    ? `?filters[clinic][id][$eq]=${clinicId}`
    : '';
  const res = await fetch(`${base}/api/appointments${params}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch appointments');
  return res.json();
}

export async function fetchClinicMe() {
  const base = getApiBase();
  const res = await fetch(`${base}/api/clinics/me`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}

/** Registro médico del paciente (consultas, diagnósticos, tratamientos) */
export async function fetchPatientMedicalRecord(patientId: number | string) {
  const base = getApiBase();
  const res = await fetch(`${base}/api/patients/${patientId}/medical-record`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch medical record');
  const json = await res.json();
  return json.data ?? json;
}
