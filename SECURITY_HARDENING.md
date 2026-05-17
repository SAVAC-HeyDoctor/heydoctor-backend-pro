# HeyDoctor Security Hardening

## Scope
Sprint edge-security for NestJS (Railway) and Next.js (Vercel). No secrets or PHI in logs.

## CORS Strategy
- Production REST CORS uses an explicit allowlist plus **Vercel preview** origins (`https://*.vercel.app`).
- Fixed production hosts include `heydoctor.cl`, `app.heydoctor.cl`, `heydoctor.health`, `app.heydoctor.health`, and stable Vercel production URLs.
- Preferred env var: `CORS_ALLOWED_ORIGINS=https://app.heydoctor.health,https://app.heydoctor.cl`.
- Aliases: `CORS_ORIGIN`, `FRONTEND_URL`, `PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_URL`, `VERCEL_FRONTEND_URL`, `VERCEL_URL`.
- Wildcard env values are rejected; preview wildcards are implemented in code (hostname suffix `.vercel.app`).
- Localhost origins apply only when `NODE_ENV !== 'production'`.
- Blocked production origins log scheme/host only.

## Socket.IO / WebRTC Origin Strategy
- `/webrtc` Socket.IO CORS matches REST allowlist + Vercel previews.
- `allowRequest` enforces the same policy on Engine.IO upgrades.
- Missing `Origin` is allowed for non-browser clients; JWT and plan checks still apply.
- `REDIS_URL` required for multi-instance signaling in production.

## Swagger Policy
- Enabled in local/dev by default.
- Production: disabled unless `ENABLE_SWAGGER=true` (restrict at network/identity layer if enabled).

## Cookie Strategy
- HttpOnly `access_token` and `refresh_token`.
- Production: `Secure`, `SameSite=None`, optional `Domain=.heydoctor.health` (override with `AUTH_COOKIE_DOMAIN`; use `none` for host-only cookies).
- Development: `SameSite=Lax`, not `Secure`.
- Railway: `trust proxy` so `Secure` cookies work behind HTTPS termination.
- Cross-site cookies require frontend and API on a shared eTLD+1 (e.g. `app.heydoctor.health` + `api.heydoctor.health`).

## CSP Policy (frontend)
- Per-request nonce via `middleware.ts` → `Content-Security-Policy`.
- Production `script-src`: `'self' 'nonce-…' 'strict-dynamic'` (no `unsafe-inline` / `unsafe-eval` on scripts).
- Development: adds `'unsafe-inline'` and `'unsafe-eval'` for Next HMR.
- `style-src`: `'unsafe-inline'` (Tailwind / Next inline styles until full style nonces).
- `frame-ancestors 'none'`, `frame-src 'none'`, `object-src 'none'`.
- `connect-src`: self, API/WS env URLs, production defaults (`api.heydoctor.health`, `app.heydoctor.health`, …), `https://*.vercel.app` + `wss://*.vercel.app`, TURN/STUN (`NEXT_PUBLIC_TURN_URLS`, `WEBRTC_STUN_URLS`, scheme wildcards), Sentry ingest when `NEXT_PUBLIC_SENTRY_DSN` is set.
- `worker-src 'self' blob:` (Sentry session replay / workers).
- `media-src 'self' blob:` (WebRTC `MediaStream`).
- `upgrade-insecure-requests` in production.
- **Reporting:** `report-uri /api/csp-report` (same origin). POST `application/csp-report`; sanitized log line `csp_violation_report` (no query strings, no emails). Not stored in DB.

## CSP Policy (backend API)
- Production only: restrictive CSP on JSON/API responses (`default-src 'none'`, `frame-ancestors 'none'`, `connect-src` from CORS allowlist + ws/wss mirrors).
- `worker-src 'none'`, `media-src 'none'` (API does not run media workers).

## Permissions-Policy
- Frontend (Vercel): `camera=(self), microphone=(self)` for telemedicine; geolocation/payment/usb denied.
- Backend: same camera/microphone allowance on API responses.

## Required Railway Env Vars
- `NODE_ENV=production`
- `DATABASE_URL`, `JWT_SECRET`
- `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, `BACKEND_PUBLIC_URL`
- `AUTH_COOKIE_DOMAIN` when shared-domain cookies are required
- `REDIS_URL` before scaling beyond one replica
- `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` for WebRTC
- `SENTRY_DSN` when backend Sentry is enabled

## Required Vercel Env Vars
- `NEXT_PUBLIC_API_URL` or `BACKEND_PROXY_TARGET` + proxy mode
- `NEXT_PUBLIC_WS_URL` if WebSocket origin differs from API
- `NEXT_PUBLIC_APP_URL` for CSP connect defaults alignment
- `NEXT_PUBLIC_TURN_URLS` / `WEBRTC_STUN_URLS` for CSP + WebRTC
- `NEXT_PUBLIC_SENTRY_DSN` for error reporting (adds Sentry hosts to `connect-src`)
- `NEXT_PUBLIC_CSP_CONNECT_SRC` for extra comma-separated origins (staging only if needed)
- Never expose server secrets with `NEXT_PUBLIC_`.

## Deployment Expectations
- Migrations in CI/release jobs, not implicit production boot.
- Unknown browser origins rejected for REST and Socket.IO (except allowed Vercel previews).
- Refresh tokens only in HttpOnly cookies or mobile Bearer; no browser `localStorage` refresh storage.

## Remaining risks / unsafe directives
- `style-src 'unsafe-inline'` on frontend (common for Tailwind/Next).
- Dev-only `unsafe-inline` / `unsafe-eval` on scripts.
- CSP `connect-src` scheme wildcards (`turn:`, `stun:`) are broad by design for arbitrary TURN hosts.
- `strict-dynamic` requires browsers that honor CSP3; legacy browsers may need monitoring via `csp_violation_report` logs.
- Third-party scripts not nonce-tagged will fail until fixed (watch CSP reports after deploy).
