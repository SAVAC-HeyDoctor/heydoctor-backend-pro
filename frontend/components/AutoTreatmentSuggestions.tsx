'use client';

import React, { useEffect, useState } from 'react';
import { fetchTreatmentSuggestions } from '../lib/api-ai';

interface AutoTreatmentSuggestionsProps {
  /** Diagnóstico seleccionado (código CIE-10 o descripción) */
  diagnosis: string | null;
  clinicId?: number | null;
  onSelectTreatment?: (name: string) => void;
  onSelectPreventive?: (action: { recommendation: string; type?: string }) => void;
  className?: string;
}

/**
 * Muestra treatment_recommendations y preventive_actions cuando se selecciona un diagnóstico.
 * Datos de CDSS + Predictive Medicine.
 */
export function AutoTreatmentSuggestions({
  diagnosis,
  clinicId,
  onSelectTreatment,
  onSelectPreventive,
  className = '',
}: AutoTreatmentSuggestionsProps) {
  const [data, setData] = useState<{
    treatment_recommendations: Array<{ name: string; confidence?: number }>;
    preventive_actions: Array<{ recommendation: string; type?: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!diagnosis?.trim()) {
      setData(null);
      return;
    }
    setLoading(true);
    fetchTreatmentSuggestions(diagnosis, { clinic_id: clinicId ?? undefined })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [diagnosis, clinicId]);

  if (!diagnosis?.trim()) return null;

  if (loading) {
    return (
      <div className={`rounded-lg border border-gray-200 p-3 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
      </div>
    );
  }

  const treatments = data?.treatment_recommendations ?? [];
  const preventives = data?.preventive_actions ?? [];
  if (treatments.length === 0 && preventives.length === 0) return null;

  return (
    <div className={`rounded-lg border border-gray-200 p-3 space-y-3 ${className}`}>
      <h4 className="text-sm font-medium text-gray-700">Sugerencias de tratamiento</h4>
      {treatments.length > 0 && (
        <ul className="space-y-1">
          {treatments.map((t, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onSelectTreatment?.(t.name)}
                className="text-sm text-indigo-600 hover:underline text-left"
              >
                {t.name}
                {t.confidence != null && (
                  <span className="text-indigo-600 ml-1">({Math.round((t.confidence ?? 0) * 100)}% confidence)</span>
                )}
              </button>
              {(t as { explanation?: string }).explanation && (
                <p className="text-xs text-gray-500 mt-0.5 ml-2">Explanation: {(t as { explanation?: string }).explanation}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {preventives.length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-gray-600 mb-1">Acciones preventivas</h5>
          <ul className="space-y-1">
            {preventives.map((a, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onSelectPreventive?.({ recommendation: a.recommendation, type: a.type })}
                  className="text-sm text-gray-700 hover:text-indigo-600"
                >
                  {a.recommendation}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
