# Política de releases — HeyDoctor

Versionado y flujo de publicación para mantener **main siempre deployable** y releases **trazables**.

## SemVer (obligatorio)

Seguir [Semantic Versioning 2.0.0](https://semver.org/):

| Bump | Formato | Cuándo |
|------|---------|--------|
| **MAJOR** | `v2.0.0` | Cambios incompatibles con versiones anteriores (API, contratos, migraciones que exijan acción del cliente). |
| **MINOR** | `v1.1.0` | Nuevas capacidades **compatibles** hacia atrás. |
| **PATCH** | `v1.0.1` | Correcciones, documentación, ajustes de infra/config **sin** cambio de comportamiento contractually relevante. |

Pre-releases opcionales: `v1.2.0-rc.1` (solo si el equipo las usa de forma explícita).

## Reglas

1. **No reescribir tags publicados** — Si un tag ya está en `origin`, no usar `git tag -f` ni borrarlo para “republicar” el mismo número. Corregir con un nuevo PATCH (`v1.0.1`).
2. **Tag anotado por release** — Cada versión publicada debe tener un tag **anotado** (`git tag -a vX.Y.Z -m "..."`).
3. **GitHub Release por tag** — Al subir el tag, el workflow `.github/workflows/release.yml` crea el release en GitHub con notas generadas a partir de los commits.
4. **`main` siempre deployable** — No fusionar a `main` lo que no esté listo para producción; usar ramas/PR y CI verde.

## Flujo recomendado

1. Desarrollo en rama → **PR** → revisión → merge a **`main`**.
2. Cuando toque publicar versión: en `main` actualizado, crear tag anotado `vX.Y.Z` y `git push origin vX.Y.Z`.
3. **CI de release** genera el **GitHub Release** (changelog automático vía GitHub).
4. **Deploy**: Railway (backend) y Vercel (frontend) siguen sus reglas actuales (p. ej. deploy desde `main` o desde tag, según configuración del panel — **no cambia** con esta polítia).

## Repositorios

| Proyecto | Repo | Deploy |
|----------|------|--------|
| Backend | `SAVAC-HeyDoctor/heydoctor-backend-pro` | Railway |
| Frontend | `heydoctor-frontend` (Vercel) | Vercel |

Cada repo versiona **por separado** (tags `v*` independientes). Alinear comunicación de producto cuando backend y frontend deban subir juntos.

## Documentación relacionada

- [RELEASE-v1.0.0.md](./RELEASE-v1.0.0.md) — notas del primer release estable.
- [COMMITS.md](./COMMITS.md) — Conventional Commits (recomendado para mensajes claros y notas de release útiles).

## Opcional (futuro)

- **commitlint + Husky**: validar mensajes en local/CI (no obligatorio hoy).
- **semantic-release**: bump y changelog totalmente automáticos según commits (evaluar cuando el volumen de releases lo justifique).
