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

## Versionado y releases (SemVer)

Ver **[RELEASE.md](./RELEASE.md)** (flujo `PR → merge → tag → Release`, SemVer y script `npm run release:tag`).

El workflow `release.yml` publica GitHub Release al hacer **`git push origin v*`** (ej. `v1.2.3`).

## Flujo recomendado

```text
feature/… o fix/… → PR → CI verde → merge a main → tag → push tag
```

Evitar `git push` directo a `main` cuando la rama esté protegida.
