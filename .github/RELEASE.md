# Disciplina de release (SemVer + GitHub)

Este monorepo usa **tags `vMAJOR.MINOR.PATCH`** y el workflow [`.github/workflows/release.yml`](./workflows/release.yml) para crear **GitHub Releases** con notas autogeneradas al hacer `git push` del tag.

## Formato SemVer

| Cambio | Ejemplo |
|--------|---------|
| Primera versión estable público | `v1.0.0` |
| Nuevas features compatibles | `v1.1.0` |
| Solo correcciones / parches | `v1.1.1` |

## Reglas de equipo

```text
NO MERGE SIN CI       → PR con Backend (Nest) y Frontend (Next) en verde

TAG DESDE MAIN LIMPIO → integración ya en main; árbol sin cambios locales
```

### Sobre “deploy solo con tag”

Railway y Vercel suelen desplegar por **push a `main`**. Una política estricta de **solo desplegar cuando exista tag** hay que configurarla en cada plataforma (triggers por tag, previews, promo). Este documento no cambia ese comportamiento.

## Flujo estándar

```text
feature/… | fix/… → PR → CI verde → merge a main → tag SemVer → push tag → Release en GitHub
```

### Ejemplo

```bash
git checkout main
git pull origin main

npm run release:tag -- v1.0.0 "HeyDoctor v1.0.0 estable"
git push origin v1.0.0
```

Tras el push revisa **Releases** en GitHub y edita las notas si quieres un resumen ejecutivo encima del autogenerado.

## Primera release sugerida (notas típicas)

Título recomendado: **HeyDoctor v1.0.0**. Contenido de ejemplo:

- Autenticación y sesiones
- Teleconsulta WebRTC
- Suscripciones + auditoría de eventos
- Métricas SaaS (MRR, churn, LTV…) y panel admin tipo Stripe
- CI/CD + sincronización del frontend público

## Frontend público (`jairosc23/heydoctor-frontend`)

El sync desde `frontend/` puede ir en paralelo al tag del monorepo; en las release notes suele bastar mencionar que el frontal desplegable refleja el estado del repo público hasta la fecha del tag.

## Próximo paso: alertas operativas

- Slack para **fallos de deploy** (webhooks desde Railway/Vercel).
- Sentry/logs para errores backend y frontend (ampliación sobre lo que ya uses).
