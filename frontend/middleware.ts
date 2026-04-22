import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  SESSION_ACCESS_COOKIE,
  SESSION_REFRESH_COOKIE,
} from './lib/session-cookies';

function isPublicPath(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/login');
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasSession =
    request.cookies.has(SESSION_ACCESS_COOKIE) ||
    request.cookies.has(SESSION_REFRESH_COOKIE);

  if (!hasSession) {
    const login = new URL('/login', request.url);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
