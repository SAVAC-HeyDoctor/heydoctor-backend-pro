# Reporte de Mejoras Aplicadas - HeyDoctor Backend

**Fecha:** 2026-03-15  
**Objetivo:** Estabilidad, consistencia del modelo de datos y escalabilidad sin romper compatibilidad con Railway.

---

## 1. CAMBIOS APLICADOS

### 1.1 Modelo de Datos

| Cambio | Descripción |
|--------|-------------|
| **message → appointment** | Añadida relación `appointment` (manyToOne) en message. Añadida `messages` (oneToMany) en appointment. Permite asociar mensajes a consultas médicas. |
| **patient ↔ favorite_doctors** | Corregida relación: `manyToMany` bidireccional. patient.favorite_doctors ↔ doctor.favorite_patients (mappedBy). |
| **audit-log → clinic** | Añadida relación `clinic` (manyToOne) en audit-log. Añadida `audit_logs` (oneToMany) en clinic. Aislamiento multi-tenant. |

### 1.2 chat-sockets Legacy

- **Eliminado** `config/functions/chat-sockets/` (index.js, sessionStore.js, messageStore.js).
- No se cargaba en bootstrap; usaba socket.io-redis no instalado.
- El chat actual usa CRUD de `message` + WebSockets de `config/functions/websockets.js`.

### 1.3 Rate Limit con Redis

- **Migrado** de memoria a `rate-limiter-flexible`.
- Usa **Redis** cuando `REDIS_URL` está definido (escalable horizontalmente).
- **Fallback** a memoria cuando Redis no está disponible (desarrollo local).
- Límites: 30 req/min (POST auth, doctor-applications, payment-webhooks), 60 req/min (GET ice-servers).
- Comportamiento **fail-open** ante errores de Redis.

### 1.4 Audit-log Multi-tenant

- **audit.events.js**: Payload incluye `clinicId` en DOCUMENT_SIGNED, CONSULTATION_STARTED, IMAGE_CAPTURED.
- **audit-logger.js**: Incluye `clinic` desde ctx.state.clinicId o extra.
- **consultations.service.js**: Emite `clinicId` en CONSULTATION_STARTED.
- **audit-log controller**: Filtro por clinic (withClinicFilter) y ensureClinicAccess en findOne.
- **audit-log routes**: Política tenant-resolver en find y findOne.

### 1.5 Migración

- **migrateDefaultClinic.js**: Añadida tabla `audit_logs` para asignar clinic_id a registros existentes.

---

## 2. ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---------|--------|
| `src/api/message/content-types/message/schema.json` | + appointment (manyToOne) |
| `src/api/appointment/content-types/appointment/schema.json` | + messages (oneToMany) |
| `src/api/patient/content-types/patient/schema.json` | favorite_doctors → manyToMany, inversedBy |
| `src/api/doctor/content-types/doctor/schema.json` | + favorite_patients (manyToMany, mappedBy) |
| `src/api/audit-log/content-types/audit-log/schema.json` | + clinic (manyToOne) |
| `src/api/clinic/content-types/clinic/schema.json` | + audit_logs (oneToMany) |
| `src/middlewares/rate-limit.js` | Reescrito: Redis + rate-limiter-flexible |
| `modules/audit/audit.events.js` | + clinic en payload de eventos |
| `src/utils/audit-logger.js` | + clinic en data |
| `modules/consultations/consultations.service.js` | + clinicId en CONSULTATION_STARTED |
| `src/api/audit-log/controllers/audit-log.js` | withClinicFilter, ensureClinicAccess |
| `src/api/audit-log/routes/audit-log.js` | + tenant-resolver policy |
| `package.json` | + rate-limiter-flexible |
| `scripts/migrateDefaultClinic.js` | + audit_logs en tablas |
| `config/functions/chat-sockets/*` | **Eliminados** (3 archivos) |

---

## 3. DEPENDENCIAS NUEVAS

| Paquete | Versión | Uso |
|---------|---------|-----|
| rate-limiter-flexible | ^5.0.0 | Rate limiting con Redis o memoria |

**Nota:** ioredis ya estaba instalado. rate-limiter-flexible usa el cliente Redis de redis-cache cuando REDIS_URL está definido.

---

## 4. VALIDACIONES REALIZADAS

### Telemedicina
- **consultation**: start, doctorJoin, patientJoin, transitionStatus operativos.
- **webrtc/ice-servers**: TURN/STUN configurado (turn.heydoctor.health, Twilio).
- **connection**: WebSockets con JWT, Redis adapter en producción.
- **secure-file**: auditLogger, decryptFile, checkFileAccess.
- **videocall**: Content-type con room_id, doctor, patient, appointment.

### EventBus
- DOCUMENT_SIGNED, CONSULTATION_STARTED, IMAGE_CAPTURED con clinicId.
- audit, media, clinical listeners registrados en bootstrap.

### Multi-tenant
- tenant-resolver: clinicId desde clinic-user.
- withClinicFilter en clinical-record, patient, appointment, audit-log.
- ensureClinicAccess en findOne/update/delete.

### Seguridad
- JWT_SECRET, ADMIN_JWT_SECRET, API_TOKEN_SALT desde env.
- auditLogger en secure-file, clinical-record, patient.
- Rate limit en endpoints sensibles.

### Railway
- build: npm ci && npm run build
- start: npm run start
- healthcheck: /_health (middleware global::health)

---

## 5. RIESGOS RESTANTES

| Riesgo | Mitigación |
|--------|------------|
| **Schema changes** | Strapi crea columnas/tablas al iniciar. Ejecutar `npm run develop` o `npm start` una vez para aplicar. Para favorite_doctors manyToMany, Strapi creará tabla join. |
| **audit_logs sin clinic** | Registros antiguos tendrán clinic_id null. migrateDefaultClinic asigna default clinic. En find, withClinicFilter excluye null si user tiene clinicId. |
| **Redis no disponible** | Rate limit usa memoria (fallback). WebSockets sin Redis adapter en desarrollo. |
| **favorite_doctors datos** | Cambio de oneToMany a manyToMany puede requerir migración de datos si había datos previos. Strapi crea nueva tabla join. |

---

## 6. NIVEL DE MADUREZ ACTUALIZADO

**7.5 / 10** (antes: 7.0)

| Criterio | Antes | Después |
|----------|-------|---------|
| Modelo de datos | 7 | 8 |
| Escalabilidad | 6 | 7.5 |
| Multi-tenant | 7 | 8 |
| Seguridad | 7 | 7.5 |

**Resumen:** Mejoras aplicadas en modelo de datos, rate limit escalable, audit multi-tenant y eliminación de código legacy. El backend mantiene compatibilidad con Railway.
