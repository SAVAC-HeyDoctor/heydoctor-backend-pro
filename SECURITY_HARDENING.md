# HeyDoctor Security Hardening

## Scope
This document captures Sprint 1 edge-security expectations for the NestJS backend on Railway and the Next.js frontend on Vercel. It avoids secrets and PHI.

## CORS Strategy
- Production REST CORS uses an explicit allowlist.
- Preferred env var: `CORS_ALLOWED_ORIGINS=https://app.heydoctor.cl,https://heydoctor.cl`.
- Backward-compatible env aliases remain supported: `CORS_ORIGIN`, `FRONTEND_URL`, `PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_URL`, `VERCEL_FRONTEND_URL`, `VERCEL_URL`.
- Wildcard origins are rejected.
- Localhost origins are added only outside `NODE_ENV=production`.
- Blocked production origins are logged as scheme/host only.

## Socket.IO / WebRTC Origin Strategy
- `/webrtc` Socket.IO CORS uses the same backend allowlist as REST.
- Socket.IO also validates origins through `allowRequest`, so Engine.IO upgrades cannot bypass the REST CORS policy.
- Missing `Origin` is allowed for non-browser clients, but JWT auth and plan checks still apply.
- Production multi-instance signaling requires `REDIS_URL` for distributed room synchronization.

## Swagger Policy
- Swagger UI is enabled by default in local/dev.
- In production, Swagger is disabled unless `ENABLE_SWAGGER=true`.
- Production deployments should leave `ENABLE_SWAGGER` unset unless access is additionally restricted at the network or identity layer.

## Cookie Strategy
- Auth uses HttpOnly `access_token` and `refresh_token` cookies.
- Production cookies use `Secure` and `SameSite=None` for cross-domain Vercel/Railway flows.
- Local development uses non-secure `SameSite=Lax` cookies.
- `AUTH_COOKIE_DOMAIN` controls production cookie domain. Use `AUTH_COOKIE_DOMAIN=none` for host-only production cookies when domains do not share an eTLD+1.
- Railway requires `trust proxy` so Express treats HTTPS requests correctly behind the proxy.

## CSP Policy
- Backend production responses include a restrictive CSP for API assets and browser clients.
- Frontend middleware emits a per-request nonce CSP.
- Frontend `connect-src` includes:
  - `self`
  - `NEXT_PUBLIC_API_URL`
  - `NEXT_PUBLIC_WS_URL`
  - `BACKEND_PROXY_TARGET`
  - `NEXT_PUBLIC_CSP_CONNECT_SRC`
  - `NEXT_PUBLIC_TURN_URLS`
  - `stun:`, `stuns:`, `turn:`, `turns:`
  - Sentry ingest origins when `NEXT_PUBLIC_SENTRY_DSN` is set
- `unsafe-eval` is development-only.
- `unsafe-inline` remains for styles and transitional script compatibility; remove only after all scripts/styles are nonce-compatible.

## Required Railway Env Vars
- `NODE_ENV=production`
- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `FRONTEND_URL`
- `BACKEND_PUBLIC_URL`
- `AUTH_COOKIE_DOMAIN` when shared-domain cookies are required
- `REDIS_URL` before scaling beyond one Railway replica
- `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` for production WebRTC
- `SENTRY_DSN` when backend Sentry is enabled

## Required Vercel Env Vars
- `NEXT_PUBLIC_API_URL` or `BACKEND_PROXY_TARGET` + proxy mode
- `NEXT_PUBLIC_WS_URL` when WebSocket origin differs from API origin
- `NEXT_PUBLIC_TURN_URLS` for CSP compatibility with TURN/STUN
- `NEXT_PUBLIC_SENTRY_DSN` when frontend Sentry is enabled
- Do not expose server-only secrets with `NEXT_PUBLIC_`.

## Deployment Expectations
- Migrations run in CI/CD or a release job, not implicitly during production boot.
- Swagger remains disabled on public production.
- Unknown production browser origins are rejected for both REST and Socket.IO.
- Refresh tokens stay in HttpOnly cookies or mobile Bearer fallback only; no browser localStorage/sessionStorage refresh-token storage.
