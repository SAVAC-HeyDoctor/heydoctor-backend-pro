# HeyDoctor Backend - Current Architecture

## Stack
- NestJS
- PostgreSQL
- TypeORM
- Railway
- GitHub Actions
- Next.js frontend

---

## Core Modules
- Auth
- Users
- Clinics
- Consultations
- Appointments
- Payments (Payku)
- Subscriptions
- Notifications
- Event Outbox
- WebSocket Gateway

---

## Infrastructure
- CI parallel backend/frontend
- GitHub Actions pipelines
- Railway deployments
- PostgreSQL migrations
- Swagger/OpenAPI
- Production CORS hardening

---

## Eventing
- EventOutboxService
- retry processing
- idempotency keys
- payment succeeded/failed events
- webhook ingestion
- async dispatching

---

## Testing
### Unit Tests
- npm test

### E2E
- DATABASE_E2E=1 npm run test:e2e

### Build Validation
- npm run build

### Migration Validation
- npm run migration:run

---

## Current Stable State
- build passing
- unit tests passing
- E2E tests passing
- CI green
- Railway deployment healthy
- migrations aligned

---

## Recent Critical Fixes
- swagger runtime dependency fixes
- consultation relation persistence fixes
- outbox schema alignment
- outbox unit test stabilization
- backend E2E stabilization
- async cleanup fixes
- Payku fraud column alignment

---

## Known Risks
- local config drift
- auth tenant ambiguity
- websocket E2E harness instability
- pending migration review
- mixed snapshot branch risk

---

## Pending Review
### Safe candidates
- nest-cli.json
- AlignEventOutboxSchema migration
- payku.service.ts hardening

### Needs deeper review
- auth.service.ts
- register.dto.ts
- create-user.dto.ts
- package.json
- tsconfig.json

---

## Operational Rules
- keep main as production baseline
- avoid broad snapshot commits
- isolate infra/config changes
- validate migrations before promotion
- run build + tests before every push

---

## Useful Commands

### Build
```bash
npm run build
```

### Unit tests
```bash
npm test -- --runInBand
```

### E2E
```bash
DATABASE_E2E=1 npm run test:e2e
```

### Migrations
```bash
npm run migration:run
```

### Railway Health
```bash
curl http://localhost:3000/health
```

---

## Deployment Flow
1. local validation
2. commit isolated fix
3. push to main
4. GitHub Actions CI
5. Railway deploy
6. production health validation

---

## Notes
- CURRENT_ARCHITECTURE.md should stay concise
- update only after meaningful architectural changes
- prioritize operational clarity over exhaustive documentation
