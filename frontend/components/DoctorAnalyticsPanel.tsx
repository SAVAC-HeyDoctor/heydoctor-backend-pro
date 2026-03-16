'use client';

import React, { useEffect, useState } from 'react';
import { fetchDoctorAdoptionMetrics, type DoctorAdoptionMetrics } from '../lib/api-analytics';

interface DoctorAnalyticsPanelProps {
  days?: number;
  className?: string;
}

/**
 * Panel de métricas de adopción para Doctor Dashboard.
 * Muestra: Daily Active Doctors, AI Usage Rate, Consultation Time, Stickiness Score.
 */
export function DoctorAnalyticsPanel({ days = 7, className = '' }: DoctorAnalyticsPanelProps) {
  const [data, setData] = useState<DoctorAdoptionMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDoctorAdoptionMetrics(days)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

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

  if (!data) {
    return (
      <div className={`rounded-lg border border-gray-200 p-4 ${className}`}>
        <h3 className="font-medium text-gray-700 mb-2">Métricas de adopción</h3>
        <p className="text-sm text-gray-500">No disponibles (ClickHouse no configurado)</p>
      </div>
    );
  }

  const adoptionColor =
    data.adoption_level === 'high'
      ? 'text-green-600'
      : data.adoption_level === 'medium'
        ? 'text-amber-600'
        : 'text-gray-600';

  return (
    <div className={`rounded-lg border border-gray-200 p-4 ${className}`}>
      <h3 className="font-medium text-gray-700 mb-3">Métricas de adopción</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded bg-blue-50 p-2">
          <p className="text-xs text-blue-600">Médicos activos hoy</p>
          <p className="text-lg font-semibold text-blue-800">{data.daily_active_doctors}</p>
        </div>
        <div className="rounded bg-indigo-50 p-2">
          <p className="text-xs text-indigo-600">Uso de AI (%)</p>
          <p className="text-lg font-semibold text-indigo-800">{data.ai_usage_rate}%</p>
        </div>
        <div className="rounded bg-amber-50 p-2">
          <p className="text-xs text-amber-600">Tiempo consulta (min)</p>
          <p className="text-lg font-semibold text-amber-800">{data.avg_consultation_minutes}</p>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <p className="text-xs text-gray-600">Stickiness</p>
          <p className={`text-lg font-semibold ${adoptionColor}`}>
            {data.stickiness_score} ({data.adoption_level})
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">Últimos {days} días</p>
    </div>
  );
}
