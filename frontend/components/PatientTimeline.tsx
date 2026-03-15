'use client';

import React, { useEffect, useState } from 'react';
import { fetchPatientMedicalRecord } from '../lib/api-clinic';

interface TimelineItem {
  id: string;
  type: 'consultation' | 'diagnostic' | 'treatment' | 'document';
  date: string;
  title: string;
  detail?: string;
  meta?: Record<string, unknown>;
}

interface PatientTimelineProps {
  patientId: number | string;
  className?: string;
}

/**
 * Timeline visual del paciente: consultas, diagnósticos, tratamientos, documentos.
 * Cronológico para que el médico entienda la historia rápidamente.
 */
export function PatientTimeline({ patientId, className = '' }: PatientTimelineProps) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    fetchPatientMedicalRecord(patientId)
      .then((data: any) => {
        const list: TimelineItem[] = [];
        const apts = data?.appointments ?? [];
        for (const a of apts) {
          const date = a.date ?? a.attributes?.date ?? '';
          const dStr = date ? new Date(date).toLocaleDateString() : '';
          const doctor = a.doctor?.firstname || a.doctor?.attributes?.firstname
            ? `${a.doctor.firstname ?? a.doctor.attributes?.firstname} ${a.doctor.lastname ?? a.doctor.attributes?.lastname}`.trim()
            : 'Consulta';
          list.push({
            id: `apt-${a.id}`,
            type: 'consultation',
            date: date,
            title: `Consulta - ${doctor}`,
            detail: a.appointment_reason ?? a.attributes?.appointment_reason,
            meta: { appointmentId: a.id },
          });
          const diag = a.diagnostic ?? a.attributes?.diagnostic;
          if (diag) {
            const diagData = diag.cie_10_code ?? diag.attributes?.cie_10_code ?? {};
            const code = diagData.code ?? '';
            const desc = diagData.description ?? '';
            list.push({
              id: `diag-${diag.id ?? a.id}`,
              type: 'diagnostic',
              date: date,
              title: code ? `${code} - ${desc}` : desc || 'Diagnóstico',
              meta: { diagnosticId: diag.id },
            });
          }
        }
        const rec = data?.clinical_record as any;
        if (rec?.treatments?.length) {
          for (const t of rec.treatments) {
            const date = t.createdAt ?? t.attributes?.createdAt ?? rec.date ?? '';
            list.push({
              id: `trt-${t.id}`,
              type: 'treatment',
              date: date,
              title: t.name ?? t.attributes?.name ?? 'Tratamiento',
              detail: t.details ?? t.attributes?.details,
              meta: { treatmentId: t.id },
            });
          }
        }
        if (rec?.diagnostics?.length) {
          for (const d of rec.diagnostics) {
            const diagData = d.cie_10_code ?? d.attributes?.cie_10_code ?? {};
            const date = d.diagnostic_date ?? d.attributes?.diagnostic_date ?? rec.date ?? '';
            list.push({
              id: `diag-rec-${d.id}`,
              type: 'diagnostic',
              date: date,
              title: `${diagData.code ?? ''} - ${diagData.description ?? ''}`.trim() || 'Diagnóstico',
              meta: { diagnosticId: d.id },
            });
          }
        }
        for (const a of apts) {
          const files = a.files ?? a.attributes?.files ?? [];
          for (const f of Array.isArray(files) ? files : []) {
            const date = a.date ?? a.attributes?.date ?? '';
            list.push({
              id: `doc-${f.id ?? a.id}-${f.name ?? ''}`,
              type: 'document',
              date: date,
              title: f.name ?? f.attributes?.name ?? 'Documento',
              meta: { fileId: f.id },
            });
          }
        }
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setItems(list);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) {
    return (
      <div className={`rounded-lg border border-gray-200 p-4 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="h-20 bg-gray-100 rounded" />
      </div>
    );
  }

  const typeLabels: Record<string, string> = {
    consultation: 'Consulta',
    diagnostic: 'Diagnóstico',
    treatment: 'Tratamiento',
    document: 'Documento',
  };
  const typeColors: Record<string, string> = {
    consultation: 'bg-blue-100 text-blue-800',
    diagnostic: 'bg-amber-100 text-amber-800',
    treatment: 'bg-green-100 text-green-800',
    document: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className={`rounded-lg border border-gray-200 p-4 ${className}`}>
      <h3 className="font-medium text-gray-700 mb-4">Historial del paciente</h3>
      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />
        <div className="space-y-4 pl-8">
          {items.length === 0 ? (
            <p className="text-sm text-gray-500">Sin registros</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="relative">
                <div className={`absolute -left-5 w-3 h-3 rounded-full ${typeColors[item.type]?.split(' ')[0] ?? 'bg-gray-300'}`} />
                <div className="text-xs text-gray-500 mb-0.5">
                  {item.date ? new Date(item.date).toLocaleDateString() : ''}
                </div>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeColors[item.type] ?? 'bg-gray-100'}`}>
                  {typeLabels[item.type] ?? item.type}
                </span>
                <p className="text-sm font-medium text-gray-800 mt-1">{item.title}</p>
                {item.detail && <p className="text-xs text-gray-600 mt-0.5">{item.detail}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
