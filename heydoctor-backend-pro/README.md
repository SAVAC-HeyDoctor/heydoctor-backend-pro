# HeyDoctor Backend (NestJS)

API clínica core para HeyDoctor: **PostgreSQL**, **TypeORM**, **JWT**, **ConfigModule**.

## Requisitos

- Node.js 20+
- PostgreSQL accesible vía `DATABASE_URL`

## Configuración

```bash
cp .env.example .env
# Edita DATABASE_URL, JWT_SECRET y PORT (por defecto 3001)
```

## Autenticación

- **Registro:** `POST /api/auth/register` — `{ "email", "password" }` (mín. 6 caracteres). Rol por defecto: `doctor`. En cada registro se crea una **clínica** y el usuario queda asociado (`clinic_id`); el nombre de la clínica usa el email (máx. 200 caracteres).
- **Login:** `POST /api/auth/login` — `{ "email", "password" }`.
- Respuesta: `{ "access_token": "...", "user": { "id", "email", "role" } }`. El hash de contraseña **nunca** se devuelve.
- JWT: expiración **7d**, secreto `JWT_SECRET`. Payload: `{ sub, email, role }`.

Rutas protegidas (pacientes, consultas, etc.): cabecera  
`Authorization: Bearer <access_token>`.

En desarrollo, con `NODE_ENV !== production`, TypeORM **sincroniza** el esquema automáticamente. En **producción** usa migraciones (`synchronize` está desactivado).

## Arranque

```bash
npm install
npm run start:dev
```

- API: `http://localhost:3001/api`
- Salud: `GET /api/health`
- Pacientes (**JWT**, **por clínica**): `GET|POST /api/patients` — solo pacientes de la clínica del usuario; body `POST`: `{ "name", "email" }` (email único por clínica).
- Consultas clínicas (**JWT**, **por clínica**): `POST|GET /api/consultations`, `GET|PATCH|DELETE /api/consultations/:id` — `clinic_id` y paciente validados vía `AuthorizationService`; estado `locked` bloquea PATCH/DELETE. `POST` body: `{ "patientId", "reason" }`.

## Variables de entorno

| Variable        | Descripción                          |
|----------------|--------------------------------------|
| `DATABASE_URL` | URL PostgreSQL                       |
| `JWT_SECRET`   | Secreto para firmar tokens           |
| `PORT`         | Puerto HTTP (default 3001)           |
| `NODE_ENV`     | `production` desactiva `synchronize`   |
| `CORS_ORIGIN`  | Opcional: lista separada por comas   |
| `COOKIE_DOMAIN` | Opcional: dominio compartido para cookies de sesión (ej. `.heydoctor.health`). Mismo valor en front si comparten dominio padre. |

## Cookies de sesión (JWT)

- `access_token` y `refresh_token`: **HttpOnly**, **Secure** solo en producción, **SameSite** `none` en producción (cross-domain) y `lax` en desarrollo.
- Opcional: `COOKIE_DOMAIN` para compartir cookies entre subdominios del mismo sitio.

## CI/CD y protección de `main`

El workflow **CI** (`.github/workflows/ci.yml` en la raíz del repo) ejecuta instalación, lint, build y tests del directorio `heydoctor-backend-pro`.

Para exigir que pase antes de fusionar:

1. En GitHub: **Settings** → **Branches** → **Add branch protection rule** (o editar la regla de `main`).
2. Activar **Require a pull request before merging** (recomendado).
3. En **Require status checks to pass before merging**: activar el check y seleccionar el job del workflow (p. ej. **backend** o el nombre que muestre GitHub Actions en la pestaña *Actions* del repositorio).
4. Guardar la regla.

> Los checks obligatorios no se pueden fijar desde el código; deben configurarse en la UI (o API) de GitHub con permisos de administrador del repo.

## Estructura

- `src/audit` — `AuditLog` (tabla `audit_logs`), `AuditService`, `AuditInterceptor` global en `main.ts`
- `src/authorization` — `AuthorizationService` (aislamiento por `clinicId` y paciente)
- `src/clinic` — entidad `Clinic`, `ClinicService` (fase multi-tenant)
- `src/auth` — registro, login, JWT, `JwtAuthGuard`, `JwtStrategy`
- `src/users` — entidad `User` (email, hash, rol, clínica)
- `src/patients` — pacientes persistidos en PostgreSQL vía TypeORM
- `src/consultations` — expediente clínico (`Consultation`, estados `draft` → `locked`, multi-tenant)
