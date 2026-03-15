# Motor de Búsqueda - HeyDoctor Backend

Integración con Meilisearch para búsquedas de pacientes, doctores y diagnósticos.

## Stack

- Strapi, PostgreSQL, Redis, BullMQ
- Multi-tenant basado en `clinic`
- Meilisearch (opcional)

---

## 1. Arquitectura

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Strapi    │────▶│  Meilisearch │◀────│  Lifecycles │
│  (Primary)  │     │   (Índices)   │     │  afterCUD   │
└─────────────┘     └──────────────┘     └─────────────┘
       │                     │
       │                     │
       ▼                     ▼
┌─────────────┐     ┌──────────────┐
│  /api/search│────▶│  Fallback    │
│  q, type    │     │  SQL/Strapi  │
└─────────────┘     └──────────────┘
```

- **Meilisearch**: motor de búsqueda full-text cuando `MEILI_HOST` está definido.
- **Lifecycles**: sincronización automática en create/update/delete de patient, doctor, diagnostic.
- **Fallback**: si Meilisearch no está disponible, se usa búsqueda SQL vía Strapi entityService.

---

## 2. Configuración

### Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `MEILI_HOST` | URL de Meilisearch (ej: `http://localhost:7700`). Sin definir = búsqueda desactivada |
| `MEILI_API_KEY` | API key (opcional para desarrollo local) |

### Desactivación automática

Si `MEILI_HOST` no está definido:

- No se inicializa el cliente Meilisearch
- No se ejecutan lifecycles de sincronización
- `/api/search` usa siempre fallback SQL

---

## 3. Índices

| Índice | Campos indexados | Filtrable |
|--------|------------------|-----------|
| patients | name, email, phone, clinic_id | clinic_id |
| doctors | name, specialty, clinic_id, clinic_ids | clinic_id, clinic_ids |
| diagnostics | code, description, category, clinic_id | clinic_id |

### Mapeo de datos

- **patients**: name = firstname + lastname, email desde user, phone, clinic_id
- **doctors**: name = firstname + lastname, specialty desde specialty_profiles, clinic_ids desde appointments
- **diagnostics**: code, description, category desde cie_10_code

---

## 4. Indexación (Lifecycles)

Sincronización en:

- `api::patient.patient` → afterCreate, afterUpdate, afterDelete
- `api::doctor.doctor` → afterCreate, afterUpdate, afterDelete
- `api::diagnostic.diagnostic` → afterCreate, afterUpdate, afterDelete

Los documentos se indexan/actualizan/eliminan automáticamente en Meilisearch.

---

## 5. Multi-tenant Filtering

Todas las búsquedas filtran por `clinic_id`:

- **patients**: `clinic_id = {clinicId}` (del usuario autenticado)
- **doctors**: `clinic_ids = {clinicId}` (doctores con citas en esa clínica)
- **diagnostics**: `clinic_id = {clinicId}`

El `clinicId` se obtiene del usuario autenticado vía `tenant-resolver` (clinic-user).

---

## 6. API de Búsqueda

### Endpoint

```
GET /api/search?q=...&type=...
```

### Parámetros

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| q | string | Término de búsqueda |
| type | patient \| doctor \| diagnostic | Tipo de entidad |

### Autenticación

- Requiere usuario autenticado
- Requiere contexto de clínica (usuario asociado a clinic-user)

### Respuesta

```json
{
  "data": [...],
  "meta": { "source": "meilisearch" | "sql" }
}
```

---

## 7. Fallback SQL

Cuando Meilisearch no está disponible o retorna error:

- **patients**: entityService con filtros `$containsi` en firstname, lastname, phone
- **doctors**: entityService + filtro por appointments en la clínica
- **diagnostics**: búsqueda en cie_10_codes + filtro por diagnostic.clinic
