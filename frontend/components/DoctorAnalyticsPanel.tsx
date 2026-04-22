'use client';

import React, { useCallback } from 'react';
import {
  fetchDoctorAdoptionMetrics,
  type DoctorAdoptionMetrics,
} from '../lib/api-analytics';
import { useApiQuery } from '../hooks/useApiQuery';

interface DoctorAnalyticsPanelProps {
  days?: number;
  className?: string;
}

/**
 * Panel de métricas de adopción para Doctor Dashboard.
 * Muestra: Daily Active Doctors, AI Usage Rate, Consultation Time, Stickiness Score.
 */
export function DoctorAnalyticsPanel({
  days = 7,
  className = '',
}: DoctorAnalyticsPanelProps) {
  const fetcher = useCallback(
    () => fetchDoctorAdoptionMetrics(days),
    [days],
  );

  const { data, loading, error, refetch } = useApiQuery(
    `doctor-adoption-${days}`,
    fetcher,
  );

  if (loading) {
    return (
      <div className={`rounded-lg border border-gray-200 p-4 animate-pulse ${className}`}>
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-16 bg-gray-100 rounded" />
          <div className="h-16 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50 p-4 ${className}`}>
        <h3 className="font-medium text-amber-900 mb-1">Métricas no disponibles</h3>
        <p className="text-sm text-amber-800 mb-2">{error}</p>
        <button
          type="button"
          className="text-sm font-medium text-amber-900 underline"
          onClick={() => refetch()}
        >
          Reintentar
        </button>
      </div>
    );
  }

  const dataSafe = data as DoctorAdoptionMetrics | null;
  if (!dataSafe) {
    return (
      <div className={`rounded-lg border border-gray-200 p-4 ${className}`}>
        <h3 className="font-medium text-gray-700 mb-2">Métricas de adopción</h3>
        <p className="text-sm text-gray-500">Sin datos</p>
      </div>
    );
  }

  const adoptionColor =
    dataSafe.adoption_level === 'high'
      ? 'text-green-600'
      : dataSafe.adoption_level === 'medium'
        ? 'text-amber-600'
        : 'text-gray-600';

  return (
    <div className={`rounded-lg border border-gray-200 p-4 ${className}`}>
      <h3 className="font-medium text-gray-700 mb-3">Métricas de adopción</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded bg-blue-50 p-2">
          <p className="text-xs text-blue-600">Médicos activos hoy</p>
          <p className="text-lg font-semibold text-blue-800">
            {dataSafe.daily_active_doctors}
          </p>
        </div>
        <div className="rounded bg-indigo-50 p-2">
          <p className="text-xs text-indigo-600">Uso de AI (%)</p>
          <p className="text-lg font-semibold text-indigo-800">
            {dataSafe.ai_usage_rate}%
          </p>
        </div>
        <div className="rounded bg-amber-50 p-2">
          <p className="text-xs text-amber-600">Tiempo consulta (min)</p>
          <p className="text-lg font-semibold text-amber-800">
            {dataSafe.avg_consultation_minutes}
          </p>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <p className="text-xs text-gray-600">Stickiness</p>
          <p className={`text-lg font-semibold ${adoptionColor}`}>
            {dataSafe.stickiness_score} ({dataSafe.adoption_level})
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">Últimos {days} días</p>
    </div>
  );
}
