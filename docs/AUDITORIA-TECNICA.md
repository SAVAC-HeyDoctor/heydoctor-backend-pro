# Auditoría Técnica - Backend HeyDoctor (Strapi)

**Fecha:** 2026-03-14  
**Entorno:** Strapi 4.22.1 en Railway  
**Dominio:** https://api.heydoctor.health

---

## 1. RESUMEN EJECUTIVO

El backend está bien estructurado y la mayoría de los módulos funcionan correctamente. Se detectaron dependencias potencialmente faltantes (uuid, pdfkit, web-push, qrcode) que pueden causar `ERR_MODULE_NOT_FOUND` en ciertos entornos, código legacy no utilizado, y la necesidad de un endpoint de health para Railway.

---

## 2. DEPENDENCIAS

### 2.1 Dependencias en package.json (actuales)

| Paquete | Versión | Uso |
|---------|---------|-----|
| @sentry/node | ^10.42.0 | Monitoreo de errores |
| @socket.io/redis-adapter | ^8.3.0 | WebSockets en producción |
| @socket.io/sticky | ^1.0.4 | Sticky sessions |
| @strapi/* | 4.22.1 | Core Strapi |
| @surunnuage/strapi-plugin-expo-notifications | ^2.0.4 | Push notifications |
| axios | ^1.6.8 | HTTP client |
| dotenv | ^16.6.1 | Variables de entorno |
| into-stream | ^6.0.0 | Upload cifrado Cloudinary |
| ioredis | ^5.3.2 | Redis (cache, WebSockets) |
| jsonwebtoken | ^9.0.3 | JWT en WebSockets |
| pg | 8.11.5 | PostgreSQL |
| socket.io | ^4.7.5 | WebSockets |

### 2.2 Imports verificados vs dependencias

| Import | Archivo(s) | En package.json |
|--------|------------|-----------------|
| crypto | file-encryption, encryption | ✅ Built-in |
| path, fs | secure-file | ✅ Built-in |
| axios | secure-file, payment-webhook | ✅ |
| @strapi/strapi | Todos los controllers/services | ✅ |
| into-stream | upload-encrypted-cloudinary | ✅ |
| jsonwebtoken | websockets.js | ✅ |
| ioredis | redis-cache, websockets | ✅ |
| @socket.io/redis-adapter | websockets | ✅ |
| pg | database config, migrate script, db/index | ✅ |
| dotenv | db, migrateDefaultClinic | ✅ |
| @sentry/node | sentry.js | ✅ |
| events (EventEmitter) | eventBus | ✅ Built-in |
| util (promisify) | encryption | ✅ Built-in |

### 2.3 Paquetes que causan ERR_MODULE_NOT_FOUND (reportados)

| Paquete | En código directo | En dependencias transitivas | Acción |
|---------|------------------|-----------------------------|--------|
| uuid | No | Sí (apollo-server, purest, koa-session) | Añadir explícito |
| pdfkit | No | No | Añadir explícito (preventivo) |
| web-push | No | No | Añadir explícito (preventivo) |
| qrcode | No | No | Añadir explícito (preventivo) |

**Causa probable:** En Railway/Nixpacks, el árbol de dependencias puede resolverse distinto. Añadir estos paquetes explícitamente evita errores en entornos donde las dependencias transitivas no se instalan correctamente.

---

## 3. MÓDULOS CRÍTICOS VERIFICADOS

### 3.1 audit-logger
- **Ruta:** `src/utils/audit-logger.js`
- **Estado:** ✅ OK
- **Dependencias:** strapi (entityService), ninguna externa
- **Uso:** patient, clinical-record, secure-file

### 3.2 file-encryption
- **Ruta:** `src/utils/file-encryption.js`
- **Estado:** ✅ OK
- **Dependencias:** crypto (built-in)
- **Requisito:** `FILE_ENCRYPTION_KEY` en .env (64 hex chars). Si no está, `isEncryptionEnabled()` retorna false y el upload cifrado se omite.

### 3.3 redis-cache
- **Ruta:** `config/functions/redis-cache.js`
- **Estado:** ✅ OK
- **Dependencias:** ioredis
- **Comportamiento:** Si `REDIS_URL` no está definido, retorna null (degradación graceful). Usado por doctor, specialty-profile lifecycles.

### 3.4 tenant-scope
- **Ruta:** `src/utils/tenant-scope.js`
- **Estado:** ✅ OK
- **Dependencias:** ninguna
- **Uso:** patient, clinical-record, appointment

### 3.5 telemedicine-consent
- **Ruta:** `src/api/telemedicine-consent/`
- **Estado:** ✅ OK
- **Controller/Service/Routes:** Estándar Strapi createCoreController

### 3.6 clinical-document
- **Ruta:** `src/api/clinical-document/`
- **Estado:** ✅ OK
- **Controller/Service/Routes:** Estándar Strapi createCoreController

---

## 4. CONEXIÓN PostgreSQL

**Archivo:** `config/database.js`

```javascript
connection: {
  host: env("DATABASE_HOST"),
  port: env.int("DATABASE_PORT"),
  database: env("DATABASE_NAME"),
  user: env("DATABASE_USERNAME"),
  password: env("DATABASE_PASSWORD"),
  ssl: env.bool("DATABASE_SSL") ? { rejectUnauthorized: false } : false,
}
```

**Variables de entorno requeridas (Railway):**
- `DATABASE_HOST`
- `DATABASE_PORT` (default: 5432)
- `DATABASE_NAME`
- `DATABASE_USERNAME`
- `DATABASE_PASSWORD`
- `DATABASE_SSL` (opcional, "true" para SSL)

**Estado:** ✅ Configuración correcta. Railway inyecta estas variables desde el addon de PostgreSQL.

---

## 5. COMMONJS vs ES MODULES

- **package.json:** No tiene `"type": "module"` → proyecto es **CommonJS**
- **Imports:** Todos usan `require()` (CommonJS)
- **Exports:** Todos usan `module.exports`
- **Excepción:** `types/generated/*.d.ts` y `frontend/context/index.ts` usan `import`/`export` pero son TypeScript/declaraciones, no se ejecutan en runtime.

**Estado:** ✅ Sin mezcla problemática. Todo el backend es CommonJS.

---

## 6. CÓDIGO LEGACY / NO CARGADO

### chat-sockets
- **Estado:** Eliminado (legacy). WebSockets vía `config/functions/websockets.js` con @socket.io/redis-adapter.

---

## 7. RAILWAY DEPLOYMENT

### railway.json
```json
{
  "build": { "builder": "NIXPACKS", "buildCommand": "npm ci && npm run build" },
  "deploy": {
    "startCommand": "npm run start",
    "healthcheckPath": "/_health",
    "healthcheckTimeout": 300
  }
}
```

### nixpacks.toml
- Node 20
- `npm ci` + `npm run build` en build
- `npm run start` en start

### Problema: healthcheckPath /_health
Strapi **no expone** `/._health` por defecto. Railway espera 200 en esa ruta para considerar el servicio healthy.

**Solución:** Añadir ruta custom `/._health` o usar `/admin` (devuelve 302/200 si el admin carga).

---

## 8. PROBLEMAS DETECTADOS

| # | Problema | Severidad |
|---|----------|-----------|
| 1 | uuid, pdfkit, web-push, qrcode no declarados explícitamente; pueden causar ERR_MODULE_NOT_FOUND en Railway | Alta |
| 2 | Healthcheck `/._health` no existe; Railway puede marcar el servicio como unhealthy | Media |
| 3 | chat-sockets eliminado | Resuelto |
| 4 | FILE_ENCRYPTION_KEY opcional; sin ella el cifrado de archivos está deshabilitado | Info |
| 5 | REDIS_URL opcional; sin ella el cache y WebSocket scaling no funcionan en producción | Info |

---

## 9. SOLUCIONES

### 9.1 Añadir dependencias explícitas ✅ IMPLEMENTADO
Añadido a `package.json` en `dependencies`:
```json
"uuid": "^9.0.1",
"pdfkit": "^0.15.0",
"qrcode": "^1.5.4",
"web-push": "^3.6.7"
```

### 9.2 Endpoint de health para Railway ✅ IMPLEMENTADO
Se añadió middleware `src/middlewares/health.js` que responde `GET /._health` con `{ "status": "ok" }` y status 200. Registrado en `config/middlewares.js` como `global::health`.

### 9.3 chat-sockets
- Eliminado. WebSockets vía websockets.js con @socket.io/redis-adapter.

### 9.4 Variables de entorno en Railway
Asegurar que estén configuradas:
- `DATABASE_*` (desde addon PostgreSQL)
- `APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `JWT_SECRET`
- `PUBLIC_URL` = https://api.heydoctor.health
- `NODE_ENV` = production
- `REDIS_URL` (si se usa Redis)
- `FILE_ENCRYPTION_KEY` (opcional, 64 hex chars)
- `SENTRY_DSN` (opcional)

---

## 10. COMANDOS A EJECUTAR

### Instalación completa
```bash
# Limpiar e instalar
rm -rf node_modules package-lock.json
npm install

# O con lockfile estricto (recomendado para Railway)
npm ci
```

### Desarrollo local
```bash
# 1. Configurar .env (copiar desde .env.example)
cp .env.example .env
# Editar DATABASE_*, etc.

# 2. PostgreSQL debe estar corriendo
brew services start postgresql@14
createdb heydoctor

# 3. Iniciar
npm run develop
```

### Build y start (producción)
```bash
npm run build
npm start
```

### Verificar módulos
```bash
# Verificar que uuid está instalado
npm ls uuid

# Verificar dependencias
npm ls
```

---

## 11. CHECKLIST FINAL

- [ ] Añadir uuid, pdfkit, qrcode, web-push a package.json
- [ ] Ejecutar `npm install` o `npm ci`
- [ ] Crear endpoint /._health para Railway
- [ ] Verificar variables de entorno en Railway
- [x] chat-sockets eliminado
- [ ] Probar `npm run develop` localmente
- [ ] Probar `npm run build && npm start` localmente
- [ ] Desplegar en Railway y verificar logs
