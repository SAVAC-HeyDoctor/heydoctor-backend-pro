'use client';

import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
} from 'react';
import { apiFetch, getApiBase } from '../lib/api-client';

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
  setClinic: (clinic: Clinic | null) => void;
}

const ClinicContext = createContext<ClinicContextValue | undefined>(undefined);

export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchClinic = async () => {
      try {
        const base = getApiBase();
        const res = await apiFetch(`${base}/api/clinics/me`);
        if (res.ok) {
          const json = await res.json();
          setClinic(json.data ?? json);
        } else {
          setClinic(null);
        }
      } catch {
        setClinic(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchClinic();
  }, []);

  const value = useMemo(
    () => ({
      clinic,
      clinicId: clinic?.id ?? null,
      clinicName: clinic?.name ?? '',
      clinicSlug: clinic?.slug ?? '',
      isLoading,
      setClinic,
    }),
    [clinic, isLoading]
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
