# Auditoría enterprise — kit `frontend/` (HeyDoctor)

Ámbito revisado: carpeta `frontend/` del monorepo (componentes React + `lib/*` + `context/*`). **No existe `app/` ni `pages/` ni `package.json` previo**: es un **kit importable**, no una app Next ejecutable por sí sola. El score asume ese contexto; una app Next completa en otro repo debe sumar capas de routing, CSP y CI propias.

## Score global: **4.5 / 10**

| Eje | Score | Nota breve |
|-----|-------|------------|
| Errores globales | 4 | Sin boundary en el kit; `AppErrorBoundary` añadido para integrar en layout |
| Sesión / cookies | 6 | `apiFetch` + `credentials`; falta refresh centralizado → **añadido `apiFetchWithRefresh`** |
| Seguridad | 5 | Sin CSP/headers en kit; CSRF depende del backend (SameSite cookies); rutas no aplican sin Next |
| UX | 4 | Varios paneles tragaban errores o `return null` en loading |
| Observabilidad | 5 | `console.*` disperso; **añadidos `clientLogger` + stub Sentry** |
| Estructura | 5 | Mezcla hooks/paneles; **añadido `useApiQuery`** como patrón único |

---

## Problemas críticos (específicos del código)

1. **No hay aplicación Next cerrada en este directorio** — sin `middleware.ts`, sin `layout`, sin protección de rutas real; solo comentarios en `AppWithClinic.tsx`.
2. **`ClinicContext` silenciaba 401/500** — mismo tratamiento que “sin clínica”; no había refresh de access cookie. **Mitigado**: `apiFetchWithRefresh` + `sessionError` + log con `X-Request-Id`.
3. **`DoctorAnalyticsPanel`** — `.catch(() => setData(null))` y mensaje fijo “ClickHouse” aunque el fallo fuera 401/red/500. **Corregido** con `useApiQuery` + error + retry.
4. **`FavoriteOrdersPanel`** — `if (loading) return null` (hueco UI); errores solo `console.error`; `normalize(f: any)` (tipado débil). **Mejorado**: skeleton, `listError`, `clientLogger`, tipado algo más estricto.
5. **`api-client.ts`** — sin reintento 401, sin propagar `requestId` del backend al usuario final. **Parcialmente cubierto** en `clientLogger.withRequestId` y refresh en `session-fetch.ts`.
6. **Inconsistencia de modelo `Clinic.id`** — `number` en tipos del contexto vs UUID string en API Nest real: riesgo de bugs al comparar o serializar (deuda no resuelta aquí para no romper consumidores).

---

## Mejoras prioritarias (orden sugerido)

1. En el **repo Next real** (`heydoctor-frontend`): añadir `middleware.ts` que redirija a `/login` si cookie ausente (ejemplo en `examples/next-middleware.protect.example.ts`).
2. **Root layout**: envolver con `AppErrorBoundary` + llamar `initClientObservability()` (ya invocado desde `AppWithClinic`).
3. Sustituir progresivamente paneles que hacen `useEffect + fetch` manual por **`useApiQuery`** (mismo patrón que `DoctorAnalyticsPanel`).
4. **CSP + headers** en `next.config` del app real (`Content-Security-Policy`, `Strict-Transport-Security` detrás de HTTPS).
5. **Instalar `@sentry/nextjs`** y reemplazar `lib/sentry.stub.ts` por inicialización real + `instrumentation.ts`.
6. Unificar **`apiFetchWithRefresh`** en todas las llamadas autenticadas (`api-ai`, `api-stickiness`, etc.) — trabajo incremental.
7. Añadir **`package.json` + `tsc`** en este kit para CI de tipos al importarlo como subcarpeta.

---

## Plan hacia 10/10

| Fase | Entregable |
|------|------------|
| A | App Next con `middleware`, layouts, login route, boundary global |
| B | Todas las APIs vía `apiFetchWithRefresh` + `parseApiError` |
| C | CSP, revisión XSS en editores ricos (`ClinicalNoteEditor`), DOMPurify si hay HTML |
| D | Sentry + sampling + user context (sin PHI) |
| E | Tests E2E (Playwright) flujos login + panel crítico |
| F | Storybook o Ladle para estados loading/error de paneles |

---

## GitHub — checks obligatorios

Ver `heydoctor-backend-pro/README.md` (sección CI/CD): configurar branch protection en el repo del **frontend** igual que backend.
