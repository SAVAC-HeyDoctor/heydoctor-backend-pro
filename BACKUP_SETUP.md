# Configuración de Backup PostgreSQL

## 🔧 Variables de Entorno Requeridas (GitHub Secrets)

Debes configurar estos **Secrets** en el repositorio:

### Base de Datos
- **`DATABASE_URL`** *(requerido)*
  - Formato: `postgresql://usuario:contraseña@host:puerto/dbname`
  - Ejemplo: `postgresql://admin:pass123@db.railway.app:5432/heydoctor`
  - El script añade automáticamente `sslmode=require` si no está presente

### Almacenamiento S3/R2
- **`BACKUP_BUCKET`** *(requerido)*
  - Nombre del bucket S3 o Cloudflare R2
  - Ejemplo: `heydoctor-backups`

### Credenciales AWS
- **`AWS_ACCESS_KEY_ID`** *(requerido)*
  - ID de acceso AWS
  
- **`AWS_SECRET_ACCESS_KEY`** *(requerido)*
  - Clave secreta de acceso AWS

- **`AWS_DEFAULT_REGION`** *(recomendado)*
  - Región por defecto: `us-east-1`

- **`AWS_ENDPOINT_URL`** *(opcional)*
  - Solo para Cloudflare R2 o S3 compatible
  - Ejemplo para R2: `https://<account-id>.r2.cloudflarestorage.com`

## 📋 Configuración en GitHub

### 1. Ir a Settings del Repositorio
```
Repositorio → Settings → Secrets and variables → Actions
```

### 2. Crear cada Secret
Haz clic en "New repository secret" y agrega:

| Secret | Valor | Ejemplo |
|--------|-------|---------|
| `DATABASE_URL` | URL completa de PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `BACKUP_BUCKET` | Nombre del bucket | `heydoctor-backups` |
| `AWS_ACCESS_KEY_ID` | ID de AWS | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | Clave secreta | `wJal...` |
| `AWS_DEFAULT_REGION` | Región | `us-east-1` |
| `AWS_ENDPOINT_URL` | (opcional) Endpoint R2 | `https://xxx.r2.cloudflarestorage.com` |

## 🚀 Cómo Funciona

### Ejecución Automática
- **Cron**: `0 6 * * *` = Todos los días a las **3:00 AM (UTC-3, Chile)**
- **Manual**: Ve a Actions → PostgreSQL Daily Backup → Run workflow

### Proceso del Backup
1. ✅ Valida configuración y conexión
2. ✅ Realiza `pg_dump` comprimido con gzip
3. ✅ Sube el archivo a S3/R2
4. ✅ Limpia backups más antiguos de 30 días
5. ✅ Notifica resultado en los logs

## 🔍 Monitoreo

### Ver ejecuciones
```
Actions → PostgreSQL Daily Backup → Ver historial
```

### Logs detallados
1. Haz clic en el run que quieras revisar
2. Abre el job "backup"
3. Expande cada step para ver detalles

### Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `DATABASE_URL no está configurada` | Secret faltante | Agrega `DATABASE_URL` en Secrets |
| `Package 'awscli' has no installation candidate` | ❌ Ubuntu 24.04 issue | ✅ Usamos boto3 en su lugar |
| Connection refused | Red bloqueada | Verifica que DB acepte conexiones externas |
| `NoCredentialsError` | AWS credentials inválidas | Verifica `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` |

## 📦 Opciones Alternativas para S3/R2

### Amazon S3 Estándar
```
AWS_DEFAULT_REGION: us-east-1
AWS_ENDPOINT_URL: (dejar vacío)
```

### Cloudflare R2
```
AWS_DEFAULT_REGION: auto
AWS_ENDPOINT_URL: https://<account-id>.r2.cloudflarestorage.com
```

### MinIO u otro S3-compatible
```
AWS_DEFAULT_REGION: us-east-1
AWS_ENDPOINT_URL: https://minio.example.com:9000
```

## 🧹 Mantenimiento

### Cambiar horario de backup
Edita `.github/workflows/backup.yml`, línea 7:
```yaml
cron: "0 6 * * *"  # Cambiar a tu hora preferida (UTC)
```

**Conversión horaria (UTC):**
- 3 AM UTC-3 (Chile) = `0 6 * * *`
- 2 AM UTC-5 (Colombia/Perú) = `0 7 * * *`
- 12 PM UTC = `0 12 * * *`

### Cambiar retención de backups
Edita `.github/workflows/backup.yml`, línea 15:
```yaml
BACKUP_RETENTION_DAYS: "30"  # Cambiar número de días
```

## ✅ Test Manual

Para probar sin esperar al cron:
1. Ve a **Actions** → **PostgreSQL Daily Backup**
2. Haz clic en **"Run workflow"** (botón azul)
3. Selecciona **main** branch
4. Haz clic en **"Run workflow"**

## 🛡️ Seguridad

✅ **Implementado:**
- Encriptación SSL/TLS para conexión DB
- Compresión gzip (máximo nivel 9)
- Encriptación Server-Side (AES256) en S3
- Secrets seguros (no visibles en logs)
- Validación de variables requeridas
- Manejo robusto de errores

⚠️ **Recomendaciones:**
- Rotata credenciales AWS periódicamente
- Mantén backups en múltiples regiones
- Prueba restores regularmente
- Monitorea errores en GitHub Actions

