/**
 * Copiar a `middleware.ts` en la raíz del proyecto Next (no en este kit).
 * Ajustar matcher y cookie names según el backend (access_token HttpOnly).
 *
 * Limitación: cookies HttpOnly NO son legibles desde JS ni desde middleware del edge
 * si solo existen como HttpOnly — este ejemplo asume que marcas sesión con una cookie
 * legible tipo `session=present` o usas verificación server-side en layout.
 *
 * Patrón recomendado con solo HttpOnly: proteger en Server Components llamando a
 * `GET /api/auth/me` o `/api/clinics/me` y redirigir si 401.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hasSessionHint =
    request.cookies.has('access_token') || request.cookies.has('refresh_token');

  if (!hasSessionHint && request.nextUrl.pathname.startsWith('/panel')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/panel/:path*'],
};
