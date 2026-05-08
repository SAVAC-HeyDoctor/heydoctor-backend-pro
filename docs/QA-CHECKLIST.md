# HeyDoctor — QA manual (pre-producción)

Lista de comprobación antes de escalar tráfico o activar nuevas features. Complementa los tests automatizados (`DATABASE_E2E=1 npm run test:e2e` en `heydoctor-backend-pro`).

---

## 1. Prerrequisitos

- [ ] Backend desplegado con misma versión que `main` y migraciones aplicadas.
- [ ] `REDIS_URL` en producción (rate limit, métricas ops multi-réplica, correlación de alertas).
- [ ] Payku (API + webhook): secret o bearer configurado; **no** `PAYKU_WEBHOOK_ALLOW_UNSAFE_LOCAL` en prod.
- [ ] Webhook Slack (opcional pero recomendado) para validar textos de `analysis`.

---

## 2. Flujo extremo a extremo (humano)

1. [ ] **Login** (email/contraseña o flujo real del SPA).
2. [ ] **Dashboard** médico / admin según rol.
3. [ ] **Checkout** (consulta o pricing PRO): URL Payku o mock según env.
4. [ ] **Pago simulado**: webhook test o panel Payku sandbox.
5. [ ] **Alertas**: forzar un 500 en staging (ruta de prueba) y verificar **un solo** aviso en Slack por dedupe.
6. [ ] **Dashboard Ops** (`/admin/ops`): RPM, error rate, **P95/P99**, serie de RPM.
7. [ ] **Trace**: copiar `X-Request-Id` de respuesta y buscarlo en Ops → trazas.

---

## 3. Autenticación y sesión

- [ ] Login válido; refresh con cookie; expiración razonable.
- [ ] Credenciales inválidas → mensaje genérico / 401.
- [ ] Acceso a `/api/auth/me` sin token → 401.
- [ ] CSRF en mutaciones con sesión (login entrega `csrf_token`).

---

## 4. Pagos (Payku)

- [ ] `create-payment-session` solo para usuario autorizado y consulta válida.
- [ ] Webhook **success** actualiza pago y dispara eventos/analytics esperados.
- [ ] Webhook **failed** deja estado final coherente.
- [ ] Segundo webhook idéntico → **idempotencia** (`duplicate` / sin doble cargo).

---

## 5. Growth / embudo / experimentos

- [ ] `events-public` solo con `anonSessionId` y nombres permitidos.
- [ ] Eventos autenticados en `/api/growth/events`.
- [ ] Panel admin: funnel/resumen coherente con datos de prueba.
- [ ] `experiment-preview` devuelve variante estable para la misma `anonId`.

---

## 6. Videollamada (PRO)

- [ ] Usuario **FREE** no mantiene socket `/webrtc` (desconexión tras handshake).
- [ ] Usuario **PRO** con acceso a la consulta puede `join-consultation` y recibir ACK `ok`.

---

## 7. Observabilidad y alertas

- [ ] Tras errores 5xx: alerta `server_error` con path/método (staging).
- [ ] Reglas de negocio: `revenue_drop`, `no_payments_detected`, `conversion_drop` probadas en staging con datos sembrados o cron manual si existe.
- [ ] `latency_spike` (P95) con umbral `OPS_ANOMALY_P95_MS` revisado para no ruido.

---

## 8. Resiliencia (staging / carga controlada)

- [ ] **`REDIS_URL` ausente**: app arranca; entendimiento de **degradación** (límites por instancia, métricas no globales).
- [ ] Payku lento/off: checkout no tumba todo el API (mock URL / circuit breaker en logs).
- [ ] Carga opcional: `autocannon -c 50 -d 30 http://localhost:PUERTO/api/health` (puerto del backend) — sin errores masivos.

---

## 9. Criterio de aprobación

- [ ] Sin errores críticos abiertos en monitoreo.
- [ ] Alertas visibles en Slack con **insight** (campo `analysis`).
- [ ] Dedupe: mismo incidente no spamea canales.
- [ ] Métricas Ops (RPM, error rate, **P95/P99**) coherentes con la carga de prueba.

---

## 10. Referencias

- E2E automático: `heydoctor-backend-pro/test/e2e/critical-flows.spec.ts` (requiere Postgres).
- Script estándar: `npm run test:e2e` en `heydoctor-backend-pro`.
