'use client';

import React, { useEffect, useState } from 'react';
import { evaluateCdss } from '../lib/api-ai';
import { fetchAppointments, fetchPatients } from '../lib/api-clinic';
import { ClinicalAlertsPanel } from './ClinicalAlertsPanel';
import { DoctorAnalyticsPanel } from './DoctorAnalyticsPanel';

interface DoctorDashboardPanelsProps {
  clinicId: number | null;
  /** Síntomas para CDSS (ej. desde última consulta o contexto) */
  initialSymptoms?: string[];
  className?: string;
}

/**
 * Paneles para extender el Doctor Dashboard:
 * - TodayAppointments
 * - RecentPatients
 * - ClinicalAlerts (CDSS)
 * - ClinicTrends (placeholder - requiere endpoint de analytics)
 */
export function DoctorDashboardPanels({
  clinicId,
  initialSymptoms = [],
  className = '',
}: DoctorDashboardPanelsProps) {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [cdssAlerts, setCdssAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [aptRes, patRes] = await Promise.all([
          fetchAppointments(clinicId),
          fetchPatients(clinicId),
        ]);
        setAppointments(aptRes?.data ?? aptRes ?? []);
        setPatients(patRes?.data ?? patRes ?? []);
      } catch {
        setAppointments([]);
        setPatients([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [clinicId]);

  useEffect(() => {
    if (initialSymptoms.length === 0) return;
    evaluateCdss(initialSymptoms, { clinic_id: clinicId ?? undefined })
      .then((res) => setCdssAlerts(res?.alerts ?? []))
      .catch(() => setCdssAlerts([]));
  }, [initialSymptoms, clinicId]);

  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = appointments.filter(
    (a: any) => a.date?.startsWith?.(today) || a.attributes?.date?.startsWith?.(today)
  );
  const recentPatients = patients.slice(0, 5);

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      <section className="rounded-lg border border-gray-200 p-4">
        <h3 className="font-medium text-gray-700 mb-2">Citas de hoy</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Cargando...</p>
        ) : (
          <p className="text-2xl font-semibold">{todayAppointments.length}</p>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <h3 className="font-medium text-gray-700 mb-2">Pacientes recientes</h3>
        {loading ? (
          <p className="text-sm text-gray-500">Cargando...</p>
        ) : (
          <ul className="text-sm text-gray-600">
            {recentPatients.map((p: any, i: number) => (
              <li key={i}>
                {p.firstname ?? p.attributes?.firstname} {p.lastname ?? p.attributes?.lastname}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="md:col-span-2">
        <ClinicalAlertsPanel alerts={cdssAlerts} isLoading={false} />
      </section>

      <section className="md:col-span-2 lg:col-span-4">
        <DoctorAnalyticsPanel days={7} />
      </section>
    </div>
  );
}
