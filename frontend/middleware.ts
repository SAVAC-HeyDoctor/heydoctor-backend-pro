import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildCspWithNonce } from './lib/csp-nonce';
import {
  SESSION_ACCESS_COOKIE,
  SESSION_REFRESH_COOKIE,
} from './lib/session-cookies';

function isPublicPath(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/login');
}

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function middleware(request: NextRequest) {
  const nonce = createNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const isProd = process.env.NODE_ENV === 'production';
  const csp = buildCspWithNonce(nonce, isProd);

  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  const hasSession =
    request.cookies.has(SESSION_ACCESS_COOKIE) ||
    request.cookies.has(SESSION_REFRESH_COOKIE);

  if (!hasSession) {
    const login = new URL('/login', request.url);
    const res = NextResponse.redirect(login);
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
