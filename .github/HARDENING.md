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

### `GH_TOKEN` — sync automático a `heydoctor-frontend` *(requerido)*

El workflow `sync-frontend.yml` hace push a `jairosc23/heydoctor-frontend`, un
repositorio externo. `GITHUB_TOKEN` no tiene permisos sobre repos ajenos, por lo
que se necesita un PAT propio.

**Cómo configurarlo:**

1. Ve a <https://github.com/settings/tokens> → **Generate new token (classic)**.
2. Selecciona el scope **`repo`** (acceso completo a repositorios privados/públicos).
3. Copia el token generado.
4. En este repositorio: **Settings → Secrets and variables → Actions → New repository secret**.
   - Nombre: `GH_TOKEN`
   - Valor: el token copiado en el paso 3.
5. Guarda. El workflow se activará automáticamente en el próximo push a `main`
   que modifique archivos bajo `frontend/`.

> Sin este secret el job emite una advertencia (`::warning::`) y termina con
> éxito (exit 0) para no bloquear el resto del pipeline.

### `SLACK_WEBHOOK_URL` — alertas de CI *(opcional)*

## Versionado y releases (SemVer)

Ver **[RELEASE.md](./RELEASE.md)** (flujo `PR → merge → tag → Release`, SemVer y script `npm run release:tag`).

El workflow `release.yml` publica GitHub Release al hacer **`git push origin v*`** (ej. `v1.2.3`).

## Flujo recomendado

```text
feature/… o fix/… → PR → CI verde → merge a main → tag → push tag
```

Evitar `git push` directo a `main` cuando la rama esté protegida.
