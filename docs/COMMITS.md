# Conventional Commits — HeyDoctor

Formato recomendado para mensajes de commit. Mejora la lectura del historial y las **release notes** automáticas de GitHub.

## Formato

```
<tipo>[alcance opcional]: <descripción corta>

[cuerpo opcional]

[footer opcional]
```

- **tipo**: obligatorio (ver tabla abajo).
- **alcance**: opcional, nombre del módulo o área (`auth`, `payments`, `frontend`).
- **descripción**: imperativo, presente (“add”, “fix”), sin mayúscula inicial en la primera palabra si es posible, sin punto final.

## Tipos habituales

| Tipo | Uso |
|------|-----|
| `feat` | Nueva funcionalidad (suele implicar MINOR en SemVer). |
| `fix` | Corrección de bug (PATCH). |
| `docs` | Solo documentación. |
| `refactor` | Cambio interno sin alterar comportamiento observado. |
| `perf` | Mejora de rendimiento. |
| `test` | Añadir o corregir tests. |
| `chore` | Mantenimiento, infra, dependencias, config (sin lógica de producto). |
| `ci` | Cambios en pipelines (GitHub Actions, etc.). |

Otros permitidos en la especificación: `build`, `style`, `revert`, etc.

## Ejemplos

```
feat(auth): add MFA support
fix(payments): prevent duplicate webhook processing
docs(release): add SemVer policy
refactor(audit): isolate persistence error handling
perf(api): reduce N+1 queries on clinic list
test(security): add IDOR case for consultations
chore(deps): bump nestjs to 11.x
ci(release): add tag-triggered GitHub Release workflow
```

## Breaking changes

Si el cambio rompe compatibilidad, indicarlo en el footer:

```
feat(api)!: remove legacy /v1/login endpoint

BREAKING CHANGE: clients must use /api/auth/login only.
```

El `!` tras el tipo/alcance también puede señalar breaking change en herramientas compatibles.

## Referencias

- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/)
