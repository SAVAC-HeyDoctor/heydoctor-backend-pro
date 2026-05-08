# Checklist de auditoría — seguridad y resiliencia

Revisión periódica (release / trimestral). Marcar N/A donde no aplique.

## Autenticación y autorización

- [ ] Rutas administrativas y de panel protegidas con JWT + roles donde corresponde.
- [ ] `@Public()` solo en login, registro, health, webhooks acordados y rutas anónimas documentadas.
- [ ] IDs de recurso validados (UUID) y ownership / `clinicId` donde aplica.

## Pagos y webhooks

- [ ] Webhook Payku valida firma / secret / IP según política desplegada.
- [ ] Reintentos y circuit breaker activos en llamadas a Payku.
- [ ] No se expone información de tarjeta ni secretos en logs estructurados.

## Rate limiting

- [ ] Throttling configurado en rutas sensibles (auth, webhooks, growth público).
- [ ] Redis en producción multi-réplica para límites coherentes (o consciente del modo memoria).

## Observabilidad

- [ ] Errores HTTP ≥500 generan alerta vía `notifyAlert` donde está configurado.
- [ ] `X-Request-Id` presente en respuestas y propagación desde cliente cuando aplica.
- [ ] Spans de trazas en operaciones críticas (p. ej. Payku) con `trace_span` en logs.

## Código

- [ ] Evitar `catch {}` vacíos en flujos de negocio; al menos log o métrica.
- [ ] Tests (`npm test`) y, con DB, `test:e2e` en CI o local antes de release.
