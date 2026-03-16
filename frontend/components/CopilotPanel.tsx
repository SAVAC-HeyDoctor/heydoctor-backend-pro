'use client';

import React from 'react';

export interface CopilotSuggestion {
  symptoms_detected?: string[];
  possible_diagnoses?: string[];
  suggested_diagnoses?: { code: string; description?: string; confidence?: number; confidence_score?: number; explanation?: string; risk_flag?: boolean }[];
  suggested_questions?: string[];
  suggested_tests?: string[];
  suggested_treatments?: { name: string; confidence?: number; confidence_score?: number; explanation?: string; risk_flag?: boolean }[];
}

interface CopilotPanelProps {
  data: CopilotSuggestion | null;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * Panel de AI Copilot - muestra sugerencias durante la consulta.
 * Datos de: GET /api/copilot/suggestions?consultationId=X
 */
export function CopilotPanel({ data, isLoading, error, className = '' }: CopilotPanelProps) {
  if (error) {
    return (
      <div className={`p-4 rounded-lg bg-red-50 text-red-700 ${className}`}>
        Error: {error}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`p-4 rounded-lg bg-gray-50 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
      </div>
    );
  }

  if (!data) return null;

  const symptoms = data.symptoms_detected ?? [];
  const diagnoses = data.possible_diagnoses ?? data.suggested_diagnoses?.map((d) => d.description || d.code) ?? [];
  const questions = data.suggested_questions ?? [];
  const tests = data.suggested_tests ?? [];
  const treatments = data.suggested_treatments ?? [];

  const hasContent = symptoms.length > 0 || diagnoses.length > 0 || questions.length > 0 || tests.length > 0 || treatments.length > 0;

  if (!hasContent) {
    return (
      <div className={`p-4 rounded-lg bg-gray-50 text-gray-500 text-sm ${className}`}>
        Sin sugerencias aún. El Copilot se actualiza durante la consulta.
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      <div className="px-3 py-2 bg-indigo-50 border-b border-gray-200 font-medium text-sm text-indigo-800">
        AI Copilot
      </div>
      <div className="p-3 space-y-3 text-sm">
        {symptoms.length > 0 && (
          <section>
            <h4 className="font-medium text-gray-700 mb-1">Síntomas detectados</h4>
            <ul className="list-disc list-inside text-gray-600">
              {symptoms.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        )}
        {diagnoses.length > 0 && (
          <section>
            <h4 className="font-medium text-gray-700 mb-1">Posibles diagnósticos</h4>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              {(data.suggested_diagnoses ?? data.possible_diagnoses ?? []).map((d, i) => {
                const desc = typeof d === 'string' ? d : (d as { description?: string }).description || (d as { code?: string }).code || '';
                const conf = typeof d === 'object' && d !== null ? (d as { confidence?: number; confidence_score?: number }).confidence ?? (d as { confidence_score?: number }).confidence_score : null;
                const expl = typeof d === 'object' && d !== null ? (d as { explanation?: string }).explanation : null;
                return (
                  <li key={i} className="pl-1">
                    <span>{desc}</span>
                    {conf != null && <span className="text-indigo-600 ml-1">({Math.round(conf * 100)}% confidence)</span>}
                    {expl && <p className="text-xs text-gray-500 mt-0.5 ml-4">Explanation: {expl}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {questions.length > 0 && (
          <section>
            <h4 className="font-medium text-gray-700 mb-1">Preguntas sugeridas</h4>
            <ul className="list-disc list-inside text-gray-600">
              {questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </section>
        )}
        {tests.length > 0 && (
          <section>
            <h4 className="font-medium text-gray-700 mb-1">Pruebas recomendadas</h4>
            <ul className="list-disc list-inside text-gray-600">
              {tests.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>
        )}
        {treatments.length > 0 && (
          <section>
            <h4 className="font-medium text-gray-700 mb-1">Tratamientos sugeridos</h4>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              {(data.suggested_treatments ?? []).map((t, i) => {
                const name = typeof t === 'object' && t !== null ? (t as { name?: string }).name : String(t);
                const conf = typeof t === 'object' && t !== null ? (t as { confidence?: number; confidence_score?: number }).confidence ?? (t as { confidence_score?: number }).confidence_score : null;
                const expl = typeof t === 'object' && t !== null ? (t as { explanation?: string }).explanation : null;
                return (
                  <li key={i} className="pl-1">
                    <span>{name}</span>
                    {conf != null && <span className="text-indigo-600 ml-1">({Math.round(conf * 100)}%)</span>}
                    {expl && <p className="text-xs text-gray-500 mt-0.5 ml-4">Explanation: {expl}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
