# HeyDoctor NestJS Backend

Backend production-ready con NestJS, PostgreSQL, OpenAI y despliegue en Railway.

## Requisitos

- Node.js 18+
- PostgreSQL 14+

## Variables de entorno

```env
# Server
PORT=3000
NODE_ENV=production

# Database (PostgreSQL)
# Railway: usa DATABASE_URL automáticamente
DATABASE_URL=
# O variables individuales:
DB_HOST=
DB_PORT=5432
DB_USERNAME=
DB_PASSWORD=
DB_DATABASE=

# JWT (debe coincidir con el frontend/token issuer)
JWT_SECRET=
JWT_EXPIRES_IN=7d

# OpenAI (opcional - sin key retorna datos mock)
OPENAI_API_KEY=
```

## Desarrollo

```bash
cp .env.example .env
# Editar .env con tus valores

npm install
npm run start:dev
```

API en `http://localhost:3000/api`

## Producción

```bash
npm run build
npm run start:prod
```

## Railway

1. Conectar el repo a Railway
2. Añadir servicio PostgreSQL (Railway lo inyecta vía `DATABASE_URL` o variables)
3. Configurar variables: `JWT_SECRET`, `OPENAI_API_KEY`
4. Deploy automático con Dockerfile o Nixpacks

Railway detecta `Dockerfile` o `nixpacks.toml` para el build.

## Endpoints soportados

Ver documentación del frontend para la lista completa de 29 endpoints.

| Dominio | Ejemplos |
|---------|----------|
| Auth | JWT Bearer en header |
| Clinic | GET /api/clinics/me, /api/patients, /api/appointments |
| Copilot | GET/POST /api/copilot/* |
| CDSS | POST /api/cdss/evaluate |
| Predictive | POST /api/predictive-medicine/risk |
| Clinical Intelligence | GET /api/clinical-intelligence/suggest |
| Search | GET /api/search |
| Lab Orders | POST/GET /api/lab-orders/* |
| Prescriptions | POST/GET /api/prescriptions/* |
| Clinical Insights | GET /api/clinical-insight/patient/:id |
| Clinical Apps | GET /api/clinical-apps |
| Templates | CRUD /api/templates |
| Favorite Orders | CRUD /api/favorite-orders |
| Patient Reminders | CRUD /api/patient-reminders |
| Analytics | GET /api/analytics/doctor-adoption |
