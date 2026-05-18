import { NextResponse } from 'next/server';
import { sanitizeCspReportPayload } from '../../../lib/csp-report';

export const runtime = 'edge';

/**
 * Receptor de violaciones CSP (report-uri). Sin PHI: solo directiva y URIs sin query.
 * No persiste en DB; log estructurado para agregadores (Vercel/Railway logs).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const contentType = request.headers.get('content-type') ?? '';
  let body: unknown;
  try {
    if (contentType.includes('application/csp-report')) {
      body = await request.json();
    } else if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      return new NextResponse(null, { status: 415 });
    }
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const sanitized = sanitizeCspReportPayload(body);
  if (sanitized) {
    console.warn('csp_violation_report', sanitized);
  }

  return new NextResponse(null, { status: 204 });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, accepts: 'POST application/csp-report' });
}
