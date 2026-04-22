'use client';

import React from 'react';

export interface PredictedCondition {
  code: string;
  description?: string;
  risk_score?: number;
}

export interface PreventiveAction {
  condition_code?: string | null;
  risk_level: string;
  recommendation: string;
  type: string;
}

interface PredictiveInsightsPanelProps {
  predicted_conditions?: PredictedCondition[];
  risk_scores?: { code: string; risk_score: number; level?: string }[];
  preventive_actions?: PreventiveAction[];
  isLoading?: boolean;
  className?: string;
}

/**
 * Panel de Predictive Medicine - condiciones predichas, scores de riesgo y acciones preventivas.
 * Datos de: POST /api/predictive-medicine/risk
 */
export function PredictiveInsightsPanel({
  predicted_conditions = [],
  risk_scores = [],
  preventive_actions = [],
  isLoading,
  className = '',
}: PredictiveInsightsPanelProps) {
  if (isLoading) {
    return (
      <div className={`p-4 rounded-lg bg-gray-50 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
      </div>
    );
  }

  const conditions = predicted_conditions.length > 0 ? predicted_conditions : risk_scores.map((r) => ({ code: r.code, risk_score: r.risk_score }));
  const hasContent = conditions.length > 0 || preventive_actions.length > 0;

  if (!hasContent) {
    return (
      <div className={`rounded-lg border border-gray-200 ${className}`}>
        <div className="px-3 py-2 bg-purple-50 border-b border-gray-200 font-medium text-sm text-purple-800">
          Predictive Medicine
        </div>
        <div className="p-3 text-sm text-gray-500">
          Ingresa síntomas para ver predicciones.
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      <div className="px-3 py-2 bg-purple-50 border-b border-gray-200 font-medium text-sm text-purple-800">
        Predictive Medicine
      </div>
      <div className="p-3 space-y-3 text-sm">
        {conditions.length > 0 && (
          <section>
            <h4 className="font-medium text-gray-700 mb-1">Condiciones predichas</h4>
            <ul className="space-y-1">
              {conditions.map((c, i) => (
                <li key={i} className="flex justify-between">
                  <span>
                    {'description' in c && typeof c.description === 'string'
                      ? c.description
                      : c.code}
                  </span>
                  <span className={`font-medium ${
                    (c.risk_score ?? 0) >= 0.7 ? 'text-red-600' :
                    (c.risk_score ?? 0) >= 0.4 ? 'text-amber-600' : 'text-gray-500'
                  }`}>
                    {((c.risk_score ?? 0) * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {preventive_actions.length > 0 && (
          <section>
            <h4 className="font-medium text-gray-700 mb-1">Acciones preventivas</h4>
            <ul className="list-disc list-inside text-gray-600">
              {preventive_actions.map((a, i) => (
                <li key={i}>{a.recommendation}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
