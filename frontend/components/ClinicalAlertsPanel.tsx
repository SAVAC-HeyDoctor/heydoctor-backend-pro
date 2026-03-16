'use client';

import React from 'react';

export interface ClinicalAlert {
  type: 'diagnostic_alert' | 'risk_alert' | 'treatment_alert' | 'preventive_alert';
  severity: 'high' | 'medium' | 'info';
  message: string;
  code?: string;
  confidence?: number;
  risk_score?: number;
  treatment?: string;
  condition_code?: string;
  action_type?: string;
  explanation?: string;
}

interface ClinicalAlertsPanelProps {
  alerts: ClinicalAlert[];
  isLoading?: boolean;
  className?: string;
}

const severityStyles: Record<string, string> = {
  high: 'bg-red-50 border-red-200 text-red-800',
  medium: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const typeLabels: Record<string, string> = {
  diagnostic_alert: 'Diagnóstico',
  risk_alert: 'Riesgo',
  treatment_alert: 'Tratamiento',
  preventive_alert: 'Preventivo',
};

/**
 * Panel de alertas clínicas CDSS.
 * Ejemplo: "High probability of hypertension based on symptoms"
 * Datos de: POST /api/cdss/evaluate
 */
export function ClinicalAlertsPanel({ alerts, isLoading, className = '' }: ClinicalAlertsPanelProps) {
  if (isLoading) {
    return (
      <div className={`p-4 rounded-lg bg-gray-50 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className={`rounded-lg border border-gray-200 ${className}`}>
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 font-medium text-sm text-gray-700">
          Alertas clínicas
        </div>
        <div className="p-3 text-sm text-gray-500">
          Sin alertas en este momento.
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      <div className="px-3 py-2 bg-amber-50 border-b border-gray-200 font-medium text-sm text-amber-800">
        Alertas clínicas ({alerts.length})
      </div>
      <div className="p-2 space-y-2 max-h-64 overflow-y-auto">
        {alerts.map((alert, i) => (
          <div
            key={i}
            className={`p-2 rounded border text-sm ${severityStyles[alert.severity] ?? 'bg-gray-50 border-gray-200'}`}
          >
            <span className="font-medium text-xs uppercase">
              {typeLabels[alert.type] ?? alert.type}
            </span>
            <p className="mt-0.5">{alert.message}</p>
            {alert.confidence != null && (
              <p className="text-xs mt-0.5 opacity-80">{Math.round(alert.confidence * 100)}% confidence</p>
            )}
            {alert.explanation && (
              <p className="text-xs mt-0.5 italic">Explanation: {alert.explanation}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
