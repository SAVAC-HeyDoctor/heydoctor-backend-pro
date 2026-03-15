'use client';

import React, { useEffect, useState } from 'react';
import { fetchPredictiveRisk, fetchClinicalSuggestions } from '../lib/api-ai';

interface FollowUpSuggestion {
  recommendation: string;
  timeframe?: string;
  type?: string;
  risk_level?: string;
}

interface FollowUpSuggestionsProps {
  /** Síntomas o diagnósticos de la consulta reciente */
  symptoms: string[];
  /** Diagnósticos confirmados */
  diagnoses?: string[];
  clinicId?: number | null;
  onSelect?: (suggestion: FollowUpSuggestion) => void;
  className?: string;
}

/**
 * Sugerencias de seguimiento post-consulta.
 * Ej: "Recommended follow-up in 2 weeks"
 * Basado en Predictive Medicine + Clinical Intelligence.
 */
export function FollowUpSuggestions({
  symptoms,
  diagnoses = [],
  clinicId,
  onSelect,
  className = '',
}: FollowUpSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<FollowUpSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const input = [...symptoms, ...diagnoses].filter(Boolean);
    if (input.length === 0) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    Promise.all([
      fetchPredictiveRisk(input, { clinic_id: clinicId ?? undefined }),
      fetchClinicalSuggestions(input.join(' ')),
    ])
      .then(([pred, ci]) => {
        const list: FollowUpSuggestion[] = [];
        for (const a of pred?.preventive_actions ?? []) {
          if (a.recommendation) {
            list.push({
              recommendation: a.recommendation,
              type: a.type ?? 'follow_up',
              risk_level: a.risk_level,
            });
          }
        }
        if (list.length === 0) {
          list.push({
            recommendation: 'Seguimiento recomendado en 2 semanas',
            timeframe: '2 semanas',
            type: 'follow_up',
          });
        }
        setSuggestions(list.slice(0, 5));
      })
      .catch(() =>
        setSuggestions([{ recommendation: 'Seguimiento recomendado en 2 semanas', timeframe: '2 semanas' }])
      )
      .finally(() => setLoading(false));
  }, [symptoms.join(','), diagnoses.join(','), clinicId]);

  if (loading || suggestions.length === 0) return null;

  return (
    <div className={`rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 ${className}`}>
      <h4 className="text-sm font-medium text-indigo-800 mb-2">Sugerencias de seguimiento</h4>
      <ul className="space-y-1">
        {suggestions.map((s, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onSelect?.(s)}
              className="text-sm text-indigo-700 hover:underline text-left"
            >
              {s.recommendation}
              {s.timeframe && <span className="text-indigo-600 ml-1">({s.timeframe})</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
