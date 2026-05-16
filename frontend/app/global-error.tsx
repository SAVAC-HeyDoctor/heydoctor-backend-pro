'use client';

import { useEffect } from 'react';
import { clientLogger } from '../lib/client-logger';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientLogger.error('next_global_error', error, {
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <html lang="es">
      <body>
        <main role="alert" className="min-h-screen bg-slate-50 p-6 text-slate-900">
          <section className="mx-auto max-w-xl rounded border border-red-200 bg-red-50 p-4 text-red-800">
            <h2 className="font-semibold">Algo salió mal</h2>
            <p className="mt-2 text-sm">
              No pudimos completar esta acción. Intenta nuevamente.
            </p>
            <button
              type="button"
              className="mt-4 rounded bg-red-700 px-3 py-2 text-sm font-medium text-white"
              onClick={reset}
            >
              Reintentar
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
