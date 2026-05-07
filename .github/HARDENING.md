# Producción — protección de ramas, deploy y versionado

Lo que **no** vive en Git (configurar en GitHub / Vercel / observabilidad):

## GitHub → Settings → Branches → `main`

- Require a pull request before merging
- Require status checks to pass:

  - `Backend (Nest)`
  - `Frontend (Next)`

- Require linear history (opcional pero recomendado)
- Block force pushes
- Block branch deletion

## Vercel (`jairosc23/heydoctor-frontend`)

- Production branch: `main`
- Preview deployments: **on**
- **Only deploy on successful build** (en Project → Git → ignora commit fallidos si la opción existe en tu plan)

## Secretos (monorepo)

- `GH_TOKEN` — sync automático a `heydoctor-frontend`
- `SLACK_WEBHOOK_URL` — alertas de CI (opcional)

## Versionado

Tras un release estable:

```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

El workflow `release.yml` ya crea GitHub Release en tags `v*`.

## Flujo recomendado

```text
feature/… o fix/… → PR → CI verde → merge a main
```

Evitar `git push` directo a `main` cuando la rama esté protegida.
