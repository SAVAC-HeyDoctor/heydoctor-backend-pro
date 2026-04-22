'use client';

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
} from 'react';
import { getApiBase } from '../lib/api-client';
import { parseApiErrorResponse } from '../lib/api-error';
import { clientLogger } from '../lib/client-logger';
import { apiFetchWithRefresh } from '../lib/session-fetch';

export interface Clinic {
  id: number;
  name: string;
  slug: string;
  logo_url?: string;
  contact_email?: string;
}

interface ClinicContextValue {
  clinic: Clinic | null;
  clinicId: number | null;
  clinicName: string;
  clinicSlug: string;
  isLoading: boolean;
  /** Último fallo al cargar /api/clinics/me (401 tras refresh, red, etc.). */
  sessionError: string | null;
  setClinic: (clinic: Clinic | null) => void;
  refetchClinic: () => void;
}

const ClinicContext = createContext<ClinicContextValue | undefined>(undefined);

export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [loadTick, setLoadTick] = useState(0);

  const refetchClinic = () => setLoadTick((n) => n + 1);

  useEffect(() => {
    const fetchClinic = async () => {
      setIsLoading(true);
      setSessionError(null);
      try {
        const base = getApiBase();
        const res = await apiFetchWithRefresh(`${base}/api/clinics/me`);
        if (res.ok) {
          const json = await res.json();
          setClinic(json.data ?? json);
        } else {
          setClinic(null);
          const apiErr = await parseApiErrorResponse(res);
          setSessionError(apiErr.message);
          clientLogger.warn('clinic_me_failed', {
            status: res.status,
            requestId: res.headers.get('X-Request-Id'),
          });
        }
      } catch (e) {
        setClinic(null);
        setSessionError('No se pudo conectar con el servidor');
        clientLogger.error('clinic_me_network', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchClinic();
  }, [loadTick]);

  const value = useMemo(
    () => ({
      clinic,
      clinicId: clinic?.id ?? null,
      clinicName: clinic?.name ?? '',
      clinicSlug: clinic?.slug ?? '',
      isLoading,
      sessionError,
      setClinic,
      refetchClinic,
    }),
    [clinic, isLoading, sessionError]
  );

  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>;
}

export function useClinic() {
  const ctx = useContext(ClinicContext);
  if (ctx === undefined) {
    throw new Error('useClinic must be used within a ClinicProvider');
  }
  return ctx;
}
