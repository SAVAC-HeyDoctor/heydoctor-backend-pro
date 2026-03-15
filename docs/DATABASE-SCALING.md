# Database Scaling - HeyDoctor Backend

Documento que describe la configuración de PostgreSQL para escalar con alto volumen de tráfico.

## Stack

- Strapi, PostgreSQL, Redis, BullMQ
- Multi-tenant basado en `clinic`
- Compatible con Railway

---

## 1. Connection Pooling

**Configuración:** `config/database.js`

### Parámetros

| Parámetro | Default | Env | Descripción |
|-----------|---------|-----|-------------|
| max | 20 | `DATABASE_POOL_MAX` | Máximo de conexiones en el pool |
| idleTimeoutMillis | 30000 | `DATABASE_POOL_IDLE_TIMEOUT` | Tiempo antes de cerrar conexiones idle (30s) |
| createTimeoutMillis | 10000 | `DATABASE_POOL_CONNECT_TIMEOUT` | Timeout al crear nueva conexión |
| acquireConnectionTimeout | 10000 | `DATABASE_CONNECTION_TIMEOUT` | Timeout al adquirir conexión del pool |

### Valores sugeridos

```env
DATABASE_POOL_MAX=20
DATABASE_POOL_IDLE_TIMEOUT=30000
DATABASE_POOL_CONNECT_TIMEOUT=10000
DATABASE_CONNECTION_TIMEOUT=10000
```

### Comportamiento

- Las conexiones se reutilizan; no se crean conexiones innecesarias.
- El pool mantiene un mínimo de 2 conexiones (`min: 2`).
- Railway y la mayoría de proveedores PostgreSQL soportan hasta ~100 conexiones por instancia.

---

## 2. Read Replicas

**Módulo:** `modules/database`

### Configuración

Cuando `DATABASE_READ_HOST` está definido:

- **Lecturas (SELECT):** usan la read replica
- **Escrituras (INSERT/UPDATE/DELETE):** usan la base primary

### Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `DATABASE_READ_HOST` | Host de la read replica (obligatorio para activar) |
| `DATABASE_READ_PORT` | Puerto (default: DATABASE_PORT) |
| `DATABASE_READ_NAME` | Base de datos (default: DATABASE_NAME) |
| `DATABASE_READ_USERNAME` | Usuario (default: DATABASE_USERNAME) |
| `DATABASE_READ_PASSWORD` | Contraseña (default: DATABASE_PASSWORD) |
| `DATABASE_READ_POOL_MAX` | Máx. conexiones en pool de lectura (default: 10) |

### API

```javascript
const { dbRead, dbWrite, isReadReplicaEnabled } = require("./modules/database");

// Lecturas (usa replica si está configurada)
const read = dbRead(strapi);
if (read) {
  const result = await read.query("SELECT * FROM appointments WHERE clinic_id = $1", [clinicId]);
}

// Escrituras (siempre primary)
const write = dbWrite(strapi);
if (write) {
  await write.query("INSERT INTO audit_logs (...) VALUES (...)", [...]);
}
```

### Compatibilidad

- **Sin `DATABASE_READ_HOST`:** `dbRead()` y `dbWrite()` usan la misma conexión (primary).
- **Con `DATABASE_READ_HOST`:** `dbRead()` usa el pool de la replica; `dbWrite()` usa primary.

### Nota

`strapi.entityService` y `strapi.db.query` siguen usando la conexión primary. Para aprovechar read replicas en consultas custom, usar `dbRead(strapi)`.

---

## 3. Partitioning Strategy

**Utilidades:** `database/partitioning.js`

### Tablas candidatas

| Tabla | Partition Key | Range Key | Estrategia |
|-------|---------------|-----------|------------|
| appointments | clinic_id | created_at | RANGE(created_at) o LIST(clinic_id)+RANGE(created_at) |
| messages | - | created_at | RANGE(created_at) |
| audit_logs | clinic_id | created_at | RANGE(created_at) o LIST(clinic_id)+RANGE(created_at) |

### Preparación

- No se aplican particiones aún.
- Las utilidades documentan la estrategia y generan SQL de ejemplo.
- Las tablas ya tienen índices en `clinic_id` y `created_at` (ver `database/migrations/`).

### Ejemplo de partición futura (RANGE por mes)

```sql
-- appointments: partición mensual por created_at
CREATE TABLE appointments_partitioned (LIKE appointments INCLUDING ALL)
  PARTITION BY RANGE (created_at);

CREATE TABLE appointments_2025_01 PARTITION OF appointments_partitioned
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

---

## 4. Observabilidad de conexiones

**Módulo:** `modules/observability/db-pool-monitor.js`

### Logs estructurados

```json
{
  "type": "db_pool",
  "active_connections": 5,
  "idle_connections": 3,
  "total_connections": 8,
  "waiting_requests": 0,
  "event": "acquire"
}
```

### Eventos registrados

- `connect`: nueva conexión al pool
- `acquire`: conexión adquirida
- `remove`: conexión removida
- `error`: error de conexión
- Log periódico (cada 60s) con estado del pool

---

## 5. Validación

```bash
npm run build
npm start
```

- **Solo `DATABASE_HOST`:** funciona con configuración estándar.
- **Sin `DATABASE_READ_HOST`:** read replicas desactivadas; todo usa primary.
- **Con `DATABASE_READ_HOST`:** se inicializa el pool de lectura; `dbRead()` usa la replica.
