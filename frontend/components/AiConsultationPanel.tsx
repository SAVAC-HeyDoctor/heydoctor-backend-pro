'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { fetchCopilotSuggestions, evaluateCdss, fetchPredictiveRisk } from '../lib/api-ai';
import { CopilotPanel } from './CopilotPanel';
import { ClinicalAlertsPanel } from './ClinicalAlertsPanel';
import { ClinicalAppsPanel } from './ClinicalAppsPanel';
import { ClinicalInsightsPanel } from './ClinicalInsightsPanel';
import { LabOrdersPanel } from './LabOrdersPanel';
import { PrescriptionPanel } from './PrescriptionPanel';
import { PredictiveInsightsPanel } from './PredictiveInsightsPanel';

interface AiConsultationPanelProps {
  consultationId: number | string;
  patientId?: number | string | null;
  symptoms?: string[];
  clinicId?: number | null;
  diagnosisCode?: string;
  /** Intervalo de polling en ms (default: 30000) */
  pollInterval?: number;
  className?: string;
  showClinicalApps?: boolean;
}

/**
 * Panel lateral derecho para la página de consulta.
 * Combina: AI Copilot, CDSS Alerts, Predictive Medicine.
 * Se actualiza automáticamente durante la consulta.
 */
export function AiConsultationPanel({
  consultationId,
  symptoms = [],
  clinicId,
  pollInterval = 30000,
  showClinicalApps = true,
  patientId,
  diagnosisCode,
  className = '',
}: AiConsultationPanelProps) {
  const [copilotData, setCopilotData] = useState<any>(null);
  const [cdssData, setCdssData] = useState<any>(null);
  const [predictiveData, setPredictiveData] = useState<any>(null);
  const [loading, setLoading] = useState({ copilot: true, cdss: false, predictive: false });
  const [error, setError] = useState<string | null>(null);

  const loadCopilot = useCallback(async () => {
    try {
      setLoading((l) => ({ ...l, copilot: true }));
      const res = await fetchCopilotSuggestions(consultationId);
      setCopilotData(res.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading((l) => ({ ...l, copilot: false }));
    }
  }, [consultationId]);

  const loadCdss = useCallback(async () => {
    if (symptoms.length === 0) return;
    try {
      setLoading((l) => ({ ...l, cdss: true }));
      const res = await evaluateCdss(symptoms, { clinic_id: clinicId ?? undefined });
      setCdssData(res);
    } catch {
      // CDSS opcional
    } finally {
      setLoading((l) => ({ ...l, cdss: false }));
    }
  }, [symptoms, clinicId]);

  const loadPredictive = useCallback(async () => {
    if (symptoms.length === 0) return;
    try {
      setLoading((l) => ({ ...l, predictive: true }));
      const res = await fetchPredictiveRisk(symptoms, { clinic_id: clinicId ?? undefined });
      setPredictiveData(res);
    } catch {
      // Predictive opcional
    } finally {
      setLoading((l) => ({ ...l, predictive: false }));
    }
  }, [symptoms, clinicId]);

  useEffect(() => {
    loadCopilot();
    const timer = setInterval(loadCopilot, pollInterval);
    return () => clearInterval(timer);
  }, [loadCopilot, pollInterval]);

  useEffect(() => {
    loadCdss();
    loadPredictive();
  }, [loadCdss, loadPredictive]);

  return (
    <aside className={`w-80 flex-shrink-0 space-y-4 overflow-y-auto ${className}`}>
      <h3 className="text-sm font-semibold text-gray-700">Panel AI</h3>
      <CopilotPanel
        data={copilotData}
        isLoading={loading.copilot}
        error={error}
      />
      <ClinicalAlertsPanel
        alerts={cdssData?.alerts ?? []}
        isLoading={loading.cdss}
      />
      <PredictiveInsightsPanel
        predicted_conditions={predictiveData?.predicted_conditions}
        risk_scores={predictiveData?.risk_scores}
        preventive_actions={predictiveData?.preventive_actions}
        isLoading={loading.predictive}
      />
      {patientId && (
        <>
          <ClinicalInsightsPanel patientId={patientId} symptoms={symptoms} />
          <LabOrdersPanel
            patientId={patientId}
            consultationId={consultationId}
            diagnosisCode={diagnosisCode}
          />
          <PrescriptionPanel
            patientId={patientId}
            consultationId={consultationId}
            diagnosisCode={diagnosisCode}
          />
        </>
      )}
      {showClinicalApps && <ClinicalAppsPanel clinicId={clinicId} />}
    </aside>
  );
}
