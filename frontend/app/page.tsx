import Link from 'next/link';
import { GrowthLandingVisitBeacon } from '../components/GrowthLandingVisitBeacon';

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-16">
      <GrowthLandingVisitBeacon />
      <h1 className="text-2xl font-semibold text-slate-800">HeyDoctor</h1>
      <p className="text-slate-600">
        Aplicación Next.js con sesión por cookies HttpOnly y el toolkit clínico compartido.
      </p>
      <nav className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="rounded-lg bg-slate-800 px-4 py-2 text-center text-white hover:bg-slate-700"
        >
          Iniciar sesión
        </Link>
        <Link
          href="/pricing"
          className="rounded-lg border border-emerald-800/30 bg-emerald-50 px-4 py-2 text-center text-emerald-950 hover:bg-emerald-100"
        >
          Planes PRO
        </Link>
        <Link
          href="/panel"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-center hover:bg-slate-100"
        >
          Ir al panel
        </Link>
      </nav>
    </main>
  );
}
