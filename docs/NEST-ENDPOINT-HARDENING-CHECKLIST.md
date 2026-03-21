# Checklist de hardening — API Nest (HeyDoctor)

Este documento prioriza acciones de seguridad y compliance por **endpoint HTTP** de la API NestJS bajo el prefijo global `/api`.

## Alcance y exclusiones

- **Incluye:** controladores en `nest-backend/src/**/*.controller.ts`.
- **No incluye:** rutas **Strapi / legacy** (`src/api/**`, `config/functions/websockets.js`, etc.). Requiere checklist aparte si conviven en producción.
- **Código muerto:** en [`nest-backend/src/modules/clinic/clinic.controller.ts`](../nest-backend/src/modules/clinic/clinic.controller.ts) la clase `PatientsController` (`@Controller('patients')`) **no está registrada** en [`clinic.module.ts`](../nest-backend/src/modules/clinic/clinic.module.ts). Las rutas reales de `/api/patients` son las de [`patients/patients.controller.ts`](../nest-backend/src/modules/patients/patients.controller.ts). El barrido **omite** intencionalmente esa clase huérfana.

## Regenerar datos en bruto

```bash
cd nest-backend && npm run audit:routes
```

Salida JSON: [`docs/generated/nest-routes-raw.json`](generated/nest-routes-raw.json)

## Limitaciones del barrido automático

- No refleja el **orden de registro** de rutas de Express (colisiones `GET :id` vs rutas estáticas): se listan según aparición en el fichero.
- Columnas **P**, **PHI** y **Acción** usan **heurística** en el generador; revisar antes de auditorías formales.

## Verificación de conteo

- **Fuentes:** 21 ficheros `*.controller.ts` bajo `nest-backend/src`.
- **Rutas en este informe:** 60 (el campo `routeCount` en `nest-routes-raw.json` coincide).
- **Exclusión:** no se cuentan rutas de `PatientsController` en `clinic.controller.ts` (no registrada en `ClinicModule`).
- **Contraste runtime:** al levantar la app, `nest-backend/src/main.ts` imprime `REGISTERED_ROUTES`; debe alinearse con esta tabla para los mismos módulos en `AppModule`.

## Leyenda

| Columna | Valores |
|---------|---------|
| **P** | P0 bloquea piloto clínico serio; P1 importante; P2 mejora |
| **ClinicId** | Sí = usa `@ClinicId()`; Parcial = decorator o filtro parcial sin garantía en servicio; No = sin decorator |
| **PHI** | Datos de salud personales esperados en la respuesta/petición |

## Checklist por endpoint

| P | Method | Path | Handler | Public | ClinicId | PHI | Acción requerida |
|---|--------|------|---------|--------|----------|-----|------------------|
| P0 | POST | `/api/ai-insights/generate` | ai-insights.controller.ts#generate | No | Parcial | Alto | PHI: flag desactivar IA en piloto, minimizar prompt, BAA/Azure OpenAI; persistir CDSS como sugerencia con versión modelo; auditoría. |
| P0 | GET | `/api/ai-insights/patient/:patientId` | ai-insights.controller.ts#getByPatient | No | Parcial | Alto | PHI: flag desactivar IA en piloto, minimizar prompt, BAA/Azure OpenAI; persistir CDSS como sugerencia con versión modelo; auditoría. |
| P0 | POST | `/api/cdss/evaluate` | cdss.controller.ts#evaluate | No | No | Alto | PHI: flag desactivar IA en piloto, minimizar prompt, BAA/Azure OpenAI; persistir CDSS como sugerencia con versión modelo; auditoría. |
| P0 | GET | `/api/clinical-intelligence/suggest` | clinical-intelligence.controller.ts#suggest | No | No | Alto | PHI: flag desactivar IA en piloto, minimizar prompt, BAA/Azure OpenAI; persistir CDSS como sugerencia con versión modelo; auditoría. |
| P0 | GET | `/api/consultations` | consultations.controller.ts#findAll | No | No | Alto | Forzar request.clinicId; verificar recurso.clinicId; listados sin query tenant libre; GET lista: reducir joins o vista ligera. |
| P0 | POST | `/api/consultations` | consultations.controller.ts#create | No | No | Alto | Forzar request.clinicId; verificar recurso.clinicId; listados sin query tenant libre; GET lista: reducir joins o vista ligera. |
| P0 | GET | `/api/consultations/:id` | consultations.controller.ts#findOne | No | No | Alto | Forzar request.clinicId; verificar recurso.clinicId; listados sin query tenant libre; GET lista: reducir joins o vista ligera. |
| P0 | PATCH | `/api/consultations/:id` | consultations.controller.ts#update | No | No | Alto | Forzar request.clinicId; verificar recurso.clinicId; listados sin query tenant libre; GET lista: reducir joins o vista ligera. |
| P0 | DELETE | `/api/consultations/:id` | consultations.controller.ts#remove | No | No | Alto | Forzar request.clinicId; verificar recurso.clinicId; listados sin query tenant libre; GET lista: reducir joins o vista ligera. |
| P0 | POST | `/api/copilot/generate-clinical-note` | copilot.controller.ts#generateClinicalNote | No | No | Alto | PHI: flag desactivar IA en piloto, minimizar prompt, BAA/Azure OpenAI; persistir CDSS como sugerencia con versión modelo; auditoría. |
| P0 | GET | `/api/copilot/suggestions` | copilot.controller.ts#getSuggestions | No | No | Alto | PHI: flag desactivar IA en piloto, minimizar prompt, BAA/Azure OpenAI; persistir CDSS como sugerencia con versión modelo; auditoría. |
| P0 | GET | `/api/diagnosis` | diagnosis.controller.ts#findAll | No | No | Alto | Forzar request.clinicId; verificar recurso.clinicId; listados sin query tenant libre; GET lista: reducir joins o vista ligera. |
| P0 | POST | `/api/diagnosis` | diagnosis.controller.ts#create | No | No | Alto | Forzar request.clinicId; verificar recurso.clinicId; listados sin query tenant libre; GET lista: reducir joins o vista ligera. |
| P0 | GET | `/api/diagnosis/:id` | diagnosis.controller.ts#findOne | No | No | Alto | Forzar request.clinicId; verificar recurso.clinicId; listados sin query tenant libre; GET lista: reducir joins o vista ligera. |
| P0 | PATCH | `/api/diagnosis/:id` | diagnosis.controller.ts#update | No | No | Alto | Forzar request.clinicId; verificar recurso.clinicId; listados sin query tenant libre; GET lista: reducir joins o vista ligera. |
| P0 | DELETE | `/api/diagnosis/:id` | diagnosis.controller.ts#remove | No | No | Alto | Forzar request.clinicId; verificar recurso.clinicId; listados sin query tenant libre; GET lista: reducir joins o vista ligera. |
| P0 | GET | `/api/lab-orders` | lab-orders.controller.ts#findAll | No | No | Alto | Verificar resource.clinicId en lectura/escritura; alinear con create que ya usa doctor+clinic. |
| P0 | POST | `/api/lab-orders` | lab-orders.controller.ts#create | No | Parcial | Alto | findOne/update/remove/findAll: verificar resource.clinicId === request.clinicId; prohibir filtros tenant solo por query. |
| P0 | GET | `/api/lab-orders/:id` | lab-orders.controller.ts#findOne | No | No | Alto | Verificar resource.clinicId en lectura/escritura; alinear con create que ya usa doctor+clinic. |
| P0 | PATCH | `/api/lab-orders/:id` | lab-orders.controller.ts#update | No | No | Alto | Verificar resource.clinicId en lectura/escritura; alinear con create que ya usa doctor+clinic. |
| P0 | DELETE | `/api/lab-orders/:id` | lab-orders.controller.ts#remove | No | No | Alto | Verificar resource.clinicId en lectura/escritura; alinear con create que ya usa doctor+clinic. |
| P0 | GET | `/api/patients/:id` | patients.controller.ts#findOne | No | No | Alto | IDOR: findOne/update/delete/create deben exigir clinicId y comprobar patient.clinicId (y rol doctor si aplica). |
| P0 | PATCH | `/api/patients/:id` | patients.controller.ts#update | No | No | Alto | IDOR: findOne/update/delete/create deben exigir clinicId y comprobar patient.clinicId (y rol doctor si aplica). |
| P0 | DELETE | `/api/patients/:id` | patients.controller.ts#remove | No | No | Alto | IDOR: findOne/update/delete/create deben exigir clinicId y comprobar patient.clinicId (y rol doctor si aplica). |
| P0 | POST | `/api/predictive-medicine/risk` | predictive-medicine.controller.ts#assessRisk | No | No | Alto | PHI: flag desactivar IA en piloto, minimizar prompt, BAA/Azure OpenAI; persistir CDSS como sugerencia con versión modelo; auditoría. |
| P0 | GET | `/api/prescriptions` | prescriptions.controller.ts#findAll | No | No | Alto | Verificar resource.clinicId en lectura/escritura; alinear con create que ya usa doctor+clinic. |
| P0 | POST | `/api/prescriptions` | prescriptions.controller.ts#create | No | Parcial | Alto | findOne/update/remove/findAll: verificar resource.clinicId === request.clinicId; prohibir filtros tenant solo por query. |
| P0 | GET | `/api/prescriptions/:id` | prescriptions.controller.ts#findOne | No | No | Alto | Verificar resource.clinicId en lectura/escritura; alinear con create que ya usa doctor+clinic. |
| P0 | PATCH | `/api/prescriptions/:id` | prescriptions.controller.ts#update | No | No | Alto | Verificar resource.clinicId en lectura/escritura; alinear con create que ya usa doctor+clinic. |
| P0 | DELETE | `/api/prescriptions/:id` | prescriptions.controller.ts#remove | No | No | Alto | Verificar resource.clinicId en lectura/escritura; alinear con create que ya usa doctor+clinic. |
| P0 | GET | `/api/webrtc/ice-servers` | webrtc.controller.ts#getIceServers | Sí | No | N/A | Quitar @Public; JWT válido; ideal: credenciales TURN efímeras tras verificar participación en consulta. |
| P1 | GET | `/api/analytics/doctor-adoption` | analytics.controller.ts#getDoctorAdoption | No | Parcial | Medio | Sustituir respuestas vacías por 403 cuando falte clinicId; verificar ownership en update/delete. |
| P1 | GET | `/api/appointments` | clinic.controller.ts#getAppointments | No | Parcial | Alto | 403 si no hay clinicId; misma regla que consultations al migrar rutas duplicadas. |
| P1 | GET | `/api/auth` | auth.controller.ts#check | Sí | No | Bajo | Login/check deben ser públicos; añadir rate limiting, MFA roadmap, y nunca exponer detalles de usuario en errores. |
| P1 | POST | `/api/auth/login` | auth.controller.ts#login | Sí | No | Bajo | Login/check deben ser públicos; añadir rate limiting, MFA roadmap, y nunca exponer detalles de usuario en errores. |
| P1 | GET | `/api/clinical-apps` | clinical-apps.controller.ts#getApps | No | No | Bajo | Si el catálogo es global OK; si por clínica, filtrar por clinicId. |
| P1 | GET | `/api/clinical-insight/patient/:id` | clinical-insight.controller.ts#getPatientInsight | No | Parcial | Alto | 403 si no hay clinicId; ya filtra en servicio — unificar patrón y auditar lecturas agregadas. |
| P1 | GET | `/api/clinics/me` | clinic.controller.ts#getMe | No | No | Medio | Asegurar que solo expone clínica/doctor del usuario autenticado; sin enumeración cruzada. |
| P1 | GET | `/api/favorite-orders` | favorite-orders.controller.ts#findAll | No | Parcial | Medio | Sustituir respuestas vacías por 403 cuando falte clinicId; verificar ownership en update/delete. |
| P1 | POST | `/api/favorite-orders` | favorite-orders.controller.ts#create | No | Parcial | Medio | Sustituir respuestas vacías por 403 cuando falte clinicId; verificar ownership en update/delete. |
| P1 | DELETE | `/api/favorite-orders/:id` | favorite-orders.controller.ts#delete | No | Parcial | Medio | Sustituir respuestas vacías por 403 cuando falte clinicId; verificar ownership en update/delete. |
| P1 | GET | `/api/lab-orders/patient/:patientId` | lab-orders.controller.ts#getByPatient | No | Parcial | Alto | findOne/update/remove/findAll: verificar resource.clinicId === request.clinicId; prohibir filtros tenant solo por query. |
| P1 | GET | `/api/lab-orders/suggest-tests` | lab-orders.controller.ts#suggestTests | No | No | Bajo | Acotar por clinicId/autor si el índice de sugerencias es sensible; evitar fugas entre tenants. |
| P1 | GET | `/api/patient-reminders` | patient-reminders.controller.ts#findAll | No | Parcial | Medio | Sustituir respuestas vacías por 403 cuando falte clinicId; verificar ownership en update/delete. |
| P1 | POST | `/api/patient-reminders` | patient-reminders.controller.ts#create | No | Parcial | Medio | Sustituir respuestas vacías por 403 cuando falte clinicId; verificar ownership en update/delete. |
| P1 | PUT | `/api/patient-reminders/:id` | patient-reminders.controller.ts#update | No | Parcial | Medio | Sustituir respuestas vacías por 403 cuando falte clinicId; verificar ownership en update/delete. |
| P1 | GET | `/api/patients` | patients.controller.ts#findAll | No | Parcial | Alto | Si falta clinicId devolver 403; validar patient.clinicId === request.clinicId en medical-record y listados. |
| P1 | POST | `/api/patients` | patients.controller.ts#create | No | No | Alto | Si falta clinicId devolver 403; validar patient.clinicId === request.clinicId en medical-record y listados. |
| P1 | GET | `/api/patients/:id/medical-record` | patients.controller.ts#getMedicalRecord | No | Parcial | Alto | Si falta clinicId devolver 403; validar patient.clinicId === request.clinicId en medical-record y listados. |
| P1 | GET | `/api/prescriptions/patient/:patientId` | prescriptions.controller.ts#getByPatient | No | Parcial | Alto | findOne/update/remove/findAll: verificar resource.clinicId === request.clinicId; prohibir filtros tenant solo por query. |
| P1 | GET | `/api/prescriptions/suggest-medications` | prescriptions.controller.ts#suggestMedications | No | No | Bajo | Acotar por clinicId/autor si el índice de sugerencias es sensible; evitar fugas entre tenants. |
| P1 | GET | `/api/search` | search.controller.ts#search | No | Parcial | Alto | Exigir clinicId; no devolver resultados de otros tenants si clinicId undefined. |
| P1 | GET | `/api/templates` | templates.controller.ts#findAll | No | Parcial | Bajo | Sustituir respuestas vacías por 403 cuando falte clinicId; verificar ownership en update/delete. |
| P1 | POST | `/api/templates` | templates.controller.ts#create | No | Parcial | Bajo | Sustituir respuestas vacías por 403 cuando falte clinicId; verificar ownership en update/delete. |
| P1 | PUT | `/api/templates/:id` | templates.controller.ts#update | No | Parcial | Bajo | Sustituir respuestas vacías por 403 cuando falte clinicId; verificar ownership en update/delete. |
| P1 | DELETE | `/api/templates/:id` | templates.controller.ts#delete | No | Parcial | Bajo | Sustituir respuestas vacías por 403 cuando falte clinicId; verificar ownership en update/delete. |
| P2 | GET | `/api` | app.controller.ts#getRoot | Sí | No | N/A | Mantener sin datos clínicos; en producción restringir /api/routes si expone superficie interna. |
| P2 | GET | `/api/health` | app.controller.ts#getHealth | Sí | No | N/A | Mantener sin datos clínicos; en producción restringir /api/routes si expone superficie interna. |
| P2 | GET | `/api/ping` | app.controller.ts#ping | Sí | No | N/A | Mantener sin datos clínicos; en producción restringir /api/routes si expone superficie interna. |
| P2 | GET | `/api/routes` | app.controller.ts#getRoutes | Sí | No | N/A | Mantener sin datos clínicos; en producción restringir /api/routes si expone superficie interna. |

---
*Generado con `nest-backend/scripts/audit-nest-routes.mjs --emit-checklist`. Fecha ISO: 2026-03-21T22:13:58.478Z*
