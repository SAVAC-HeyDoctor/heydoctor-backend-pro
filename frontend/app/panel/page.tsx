'use client';

import Link from 'next/link';
import { useClinic } from '../../context';

export default function PanelPage() {
  const { clinic, clinicName, isLoading, sessionError, refetchClinic } = useClinic();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Panel</h1>
        <nav className="flex gap-3 text-sm">
          <Link href="/" className="text-slate-600 underline hover:text-slate-900">
            Inicio
          </Link>
          <button
            type="button"
            onClick={() => refetchClinic()}
            className="text-slate-600 underline hover:text-slate-900"
          >
            Recargar clínica
          </button>
        </nav>
      </div>

      {isLoading && <p className="text-slate-600">Cargando clínica…</p>}

      {!isLoading && sessionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {sessionError}
        </div>
      )}

      {!isLoading && !sessionError && clinic && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Clínica activa</p>
          <p className="text-lg font-medium text-slate-900">{clinicName}</p>
          <p className="mt-1 text-sm text-slate-600">Slug: {clinic.slug}</p>
        </div>
      )}

      {!isLoading && !sessionError && !clinic && (
        <p className="text-slate-600">No hay datos de clínica para mostrar.</p>
      )}
    </main>
  );
}
