/**
 * API client para Templates, Favorite Orders y Patient Reminders.
 */

import { getApiBase, jsonHeaders } from './api-client';
import { apiFetchWithRefresh } from './session-fetch';

const toData = (body: any) => (body?.data ? body : { data: body });

/** Templates */
export interface TemplateData {
  name: string;
  default_symptoms?: string[];
  recommended_diagnostics?: Array<{ code: string; description?: string }>;
  suggested_treatments?: string[];
  clinical_note_template?: string;
}

export async function fetchTemplates() {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/templates`);
  if (!res.ok) throw new Error('Failed to fetch templates');
  const json = await res.json();
  return json.data ?? json;
}

export async function createTemplate(data: TemplateData) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/templates`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(toData(data)),
  });
  if (!res.ok) throw new Error('Failed to create template');
  return res.json();
}

export async function updateTemplate(id: number | string, data: Partial<TemplateData>) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/templates/${id}`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(toData(data)),
  });
  if (!res.ok) throw new Error('Failed to update template');
  return res.json();
}

export async function deleteTemplate(id: number | string) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/templates/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete template');
}

/** Favorite Orders */
export interface FavoriteOrderItem {
  type: 'diagnostic' | 'treatment' | 'prescription';
  value: string;
}

export interface FavoriteOrderData {
  name: string;
  items: FavoriteOrderItem[];
  diagnosis_code?: string;
}

export async function fetchFavoriteOrders() {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/favorite-orders`);
  if (!res.ok) throw new Error('Failed to fetch favorite orders');
  const json = await res.json();
  return json.data ?? json;
}

export async function createFavoriteOrder(data: FavoriteOrderData) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/favorite-orders`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(toData(data)),
  });
  if (!res.ok) throw new Error('Failed to create favorite order');
  return res.json();
}

export async function deleteFavoriteOrder(id: number | string) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/favorite-orders/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete favorite order');
}

/** Patient Reminders */
export interface PatientReminderData {
  patient: number;
  reminder_type?: string;
  message: string;
  due_date: string;
  appointment?: number;
}

export async function fetchPatientReminders(patientId?: number | string) {
  const base = getApiBase();
  const params = patientId ? `?filters[patient][id][$eq]=${patientId}` : '';
  const res = await apiFetchWithRefresh(`${base}/api/patient-reminders${params}`);
  if (!res.ok) throw new Error('Failed to fetch patient reminders');
  const json = await res.json();
  return json.data ?? json;
}

export async function createPatientReminder(data: PatientReminderData) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/patient-reminders`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(toData(data)),
  });
  if (!res.ok) throw new Error('Failed to create patient reminder');
  return res.json();
}

export async function updatePatientReminder(
  id: number | string,
  data: Partial<PatientReminderData> & { status?: string },
) {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/patient-reminders/${id}`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(toData(data)),
  });
  if (!res.ok) throw new Error('Failed to update patient reminder');
  return res.json();
}
