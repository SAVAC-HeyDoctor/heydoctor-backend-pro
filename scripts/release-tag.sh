#!/usr/bin/env bash
# Crea un tag Git anotado SemVer sobre el commit actual.
# Uso:
#   npm run release:tag -- v1.2.3 "mensaje opcional"
# Variables:
#   ALLOW_NON_MAIN_RELEASE=1 — permitir ejecutar fuera de main (solo si sabes por qué)

set -euo pipefail

VERSION="${1:-}"
MSG="${2:-Release ${VERSION}}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
  echo "Uso: npm run release:tag -- vMAJOR.MINOR.PATCH [mensaje-del-tag]" >&2
  echo "Ejemplo: npm run release:tag -- v1.0.0 \"HeyDoctor v1.0.0\"" >&2
  exit 1
}

if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  usage
fi

if ! git rev-parse HEAD &>/dev/null; then
  echo "No es un repo git." >&2
  exit 1
fi

if ! git diff-index --quiet HEAD --; then
  echo "Hay cambios sin commitear o sin stagear. Haz commit antes de etiquetar." >&2
  exit 1
fi

CURRENT="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT" != "main" && "${ALLOW_NON_MAIN_RELEASE:-}" != "1" ]]; then
  echo "Estás en rama «$CURRENT», no «main». Cambia de rama o usa ALLOW_NON_MAIN_RELEASE=1 si es intencional." >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/${VERSION}" >/dev/null 2>&1; then
  echo "El tag ${VERSION} ya existe." >&2
  exit 1
fi

git tag -a "$VERSION" -m "$MSG"
echo "OK: tag ${VERSION} creado sobre $(git rev-parse --short HEAD)"
echo "Siguiente paso:"
echo "  git push origin ${VERSION}"
echo "(Disparará workflow Release en GitHub si está activo para tags v*)"
