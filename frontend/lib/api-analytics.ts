/**
 * API client para métricas de adopción clínica.
 */

import { apiFetch, getApiBase } from './api-client';

export interface DoctorAdoptionMetrics {
  daily_active_doctors: number;
  date?: string;
  avg_consultation_minutes: number;
  ai_usage_rate: number;
  avg_actions_per_consultation: number;
  stickiness_score: number;
  adoption_level: 'low' | 'medium' | 'high';
  meta?: { analytics_enabled: boolean; days?: number };
}

export async function fetchDoctorAdoptionMetrics(days = 7): Promise<DoctorAdoptionMetrics> {
  const base = getApiBase();
  const res = await apiFetch(
    `${base}/api/analytics/doctor-adoption?days=${days}`,
  );
  if (!res.ok) throw new Error('Failed to fetch doctor adoption metrics');
  const json = await res.json();
  return json as DoctorAdoptionMetrics;
}
