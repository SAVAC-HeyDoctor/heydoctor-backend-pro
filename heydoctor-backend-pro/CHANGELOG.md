# CHANGELOG — Suscripciones (Auditoría y consistencia)

## [Unreleased] → Deploy asociado: `de0dfee`

### feat(subscriptions): auditoría de suscripciones (events, webhooks, timeline)

Se introduce un sistema completo de auditoría para trazabilidad de cambios de suscripción.

---

## Backend — `heydoctor-backend-pro`

### Persistencia de eventos

- Nueva tabla: `subscription_events`
- Migración: `CreateSubscriptionEvents1746600000000`
- Campos:
  - `user_id`, `clinic_id`
  - `event_type`
  - `previous_plan`, `new_plan`
  - `previous_status`, `new_status`
  - `source` (`webhook` | `admin` | `system`)
  - `metadata` (JSONB)
  - `created_at`
- Índice: `(user_id, created_at)`

### Servicio

- `SubscriptionEventsService`
  - `append()` → persiste evento + logging estructurado
  - `findByUserId()` → timeline descendente

### Integración en flujos

**SubscriptionsService**

- `SUBSCRIPTION_CREATED`
- `ADMIN_UPDATED`

**PaykuService (webhooks)**

- `WEBHOOK_RECEIVED`
- `PAYMENT_SUCCEEDED`
- `PAYMENT_FAILED`

### Endpoint admin

```http
GET /api/admin/subscriptions/:userId/events
```

- Protegido con JWT + rol ADMIN
- Incluido en auditoría HTTP (`SUBSCRIPTION_EVENTS_LIST`)

---

## Consideraciones

### Eventos actualmente emitidos

- `SUBSCRIPTION_CREATED`
- `ADMIN_UPDATED`
- `WEBHOOK_RECEIVED`
- `PAYMENT_SUCCEEDED`
- `PAYMENT_FAILED`

Eventos definidos pero no emitidos aún:

- `SUBSCRIPTION_ACTIVATED`
- `SUBSCRIPTION_DEACTIVATED`
- `SUBSCRIPTION_EXPIRED`
- `PLAN_UPGRADED`
- `PLAN_DOWNGRADED`

### Fail-safe en auditoría

- Fallos al registrar eventos:
  - **No** interrumpen flujo principal
  - Se registran en logs

Comportamiento intencional (webhooks/admin no bloqueados).

---

## Validación post-deploy (Railway)

Con `migrationsRun: true`, verificar:

```sql
SELECT * FROM migrations
WHERE name = 'CreateSubscriptionEvents1746600000000';
```

Debe aparecer como aplicada.

---

## Impacto

- Trazabilidad completa de suscripciones
- Debug rápido de problemas (403, WebRTC, pagos)
- Base para métricas de negocio
- Eliminación de inconsistencias silenciosas (junto con `planGrantedForTier` y consistencia `/auth/me` ↔ `hasRequiredPlan`)

---

## Próximos pasos (opcional)

- Alertas (Slack/email) en eventos críticos
- Dashboard de suscripciones
- Timeline UI en frontend
- Métricas de conversión PRO
