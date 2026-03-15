# Arquitectura Escalable - HeyDoctor Backend

Este documento describe los componentes de arquitectura escalable implementados para llevar el sistema a nivel de madurez 9/10.

## Stack

- **Strapi** 4.x
- **PostgreSQL**
- **Redis** (opcional)
- **Arquitectura multi-tenant** basada en `clinic`

---

## 1. Job Queue (BullMQ)

**Módulo:** `modules/jobs`

Sistema de colas de trabajos usando Redis y BullMQ. Solo se activa cuando `REDIS_URL` está definido.

### Capacidades

- Encolado de jobs
- Worker processor por cola
- Reintentos automáticos (3 intentos, backoff exponencial)
- Manejo de errores centralizado

### Colas

| Cola | Caso de uso |
|------|-------------|
| `clinical-pdf` | Generación de PDF clínicos |
| `email` | Envío de emails |
| `medical-image` | Procesamiento de imágenes médicas |
| `payment-webhook` | Procesamiento de webhooks de pago |

### API

```javascript
const { enqueuePdf, enqueueEmail, enqueueImageProcessing, enqueueWebhook } = require('./modules/jobs/queues');

await enqueuePdf({ appointmentId, patientId, format });
await enqueueEmail({ to, subject, template, data });
await enqueueImageProcessing({ fileId, operation });
await enqueueWebhook({ payload, source });
```

### Redis opcional

Si `REDIS_URL` no está definido, las colas usan implementación no-op: los jobs se aceptan pero no se procesan. La aplicación arranca sin errores.

---

## 2. Observabilidad

**Módulo:** `modules/observability`

Logging estructurado, correlation IDs y error tracking.

### Funciones

- **Logs estructurados** (JSON) con timestamp, level, message, metadata
- **Request logging middleware** (`global::request-logger`): loguea método, path, status, duración
- **Correlation IDs** por request (`X-Correlation-Id`), propagables entre servicios
- **Error tracking** con `captureError()`

### Integración Sentry

Si `SENTRY_DSN` está definido, los errores capturados se envían a Sentry automáticamente.

### API

```javascript
const observability = require('./modules/observability');

observability.info('mensaje', { correlationId, clinicId });
observability.captureError(err, { context });
const id = observability.createCorrelationId();
```

---

## 3. Storage Abstraction

**Módulo:** `modules/storage`

Abstracción de almacenamiento con patrón provider. Permite cambiar proveedor sin modificar módulos clínicos.

### Proveedores

| Provider | Env vars |
|---------|----------|
| `cloudinary` (default) | `CLOUDINARY_NAME`, `CLOUDINARY_KEY`, `CLOUDINARY_SECRET` |
| `s3` | `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (opcional) |

### API

```javascript
const storage = require('./modules/storage');

const { url, key } = await storage.uploadFile({ buffer, filename, folder, contentType });
const buffer = await storage.downloadFile(keyOrUrl);
await storage.deleteFile(keyOrUrl);
```

### Cambio de proveedor

Definir `STORAGE_PROVIDER=s3` (o `cloudinary`) en variables de entorno.

---

## 4. Event-Driven Notifications

**Módulo:** `modules/notifications`

Extiende el EventBus existente (`modules/events/eventBus`) para enviar notificaciones en respuesta a eventos.

### Eventos soportados

| Evento | Origen | Canales |
|--------|--------|---------|
| `CONSULTATION_STARTED` | consultations.service | email, push |
| `consultation_joined` | doctorJoin / patientJoin | push |
| `document_uploaded` | appointment lifecycle (files) | email, push |
| `appointment_created` | consultations.service create | email, push, sms (estructura) |

### Canales

- **email**: encola jobs en cola `email` (BullMQ)
- **push**: estructura preparada (integrar con Expo Notifications)
- **sms**: estructura preparada para futuro proveedor

### Emisión de eventos

```javascript
const eventBus = require('./modules/events/eventBus');

eventBus.emit('consultation_joined', { consultationId, doctorId, role: 'doctor' });
eventBus.emit('appointment_created', { appointmentId, patientId, patientEmail });
```

---

## 5. Compatibilidad Railway

- Redis es opcional: sin `REDIS_URL`, jobs y workers se desactivan sin romper el arranque.
- Sentry es opcional: sin `SENTRY_DSN`, no se inicializa.
- Storage usa Cloudinary por defecto; S3 requiere `STORAGE_PROVIDER=s3` y variables correspondientes.

---

## 6. Validación

```bash
npm install
npm run build
npm start
```

- **Build**: debe completar sin errores.
- **Start**: requiere PostgreSQL configurado (`.env` con `DATABASE_*`). Si la base no está accesible, aparecerá `AggregateError [ECONNREFUSED]`.
- **Redis opcional**: sin `REDIS_URL`, jobs/workers se desactivan y el arranque continúa.
- **Health check**: `GET /_health` incluye estado de Redis cuando está configurado.
