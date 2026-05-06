#!/usr/bin/env bash
# Push del historial bajo frontend/ al remoto público vía subtree split.
# Requiere fast-forward en main del remoto; si falla, usar: npm run sync:frontend:safe
#
# Opcional: SKIP_CHECK=1 omite lint/build del paquete frontend.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REMOTE="${REMOTE:-jairo-fe}"
TEMP_BRANCH="${TEMP_BRANCH:-frontend-sync-temp}"
JAIRO_FE_URL="${JAIRO_FE_URL:-https://github.com/jairosc23/heydoctor-frontend.git}"

ensure_remote() {
  if git remote get-url "$REMOTE" &>/dev/null; then
    return 0
  fi
  echo "➕ Añadiendo remoto $REMOTE → $JAIRO_FE_URL"
  git remote add "$REMOTE" "$JAIRO_FE_URL"
}

require_clean_repo() {
  if ! git diff-index --quiet HEAD --; then
    echo "❌ Hay cambios sin commitear. Commitea o stashea antes de sincronizar." >&2
    exit 1
  fi
}

run_frontend_checks() {
  if [[ "${SKIP_CHECK:-}" == "1" ]]; then
    echo "⏭️  SKIP_CHECK=1 — omitiendo lint/build de frontend"
    return 0
  fi
  echo "🧪 frontend: lint + build"
  (cd frontend && npm run lint && npm run build)
}

ensure_remote
require_clean_repo
run_frontend_checks

echo "📥 git fetch $REMOTE"
git fetch "$REMOTE"

echo "🌳 git subtree split --prefix=frontend → $TEMP_BRANCH"
git branch -D "$TEMP_BRANCH" 2>/dev/null || true
git subtree split --prefix=frontend -b "$TEMP_BRANCH"

cleanup_temp() {
  git branch -D "$TEMP_BRANCH" 2>/dev/null || true
}
trap cleanup_temp EXIT

echo "📤 git push $REMOTE ${TEMP_BRANCH}:main"
if ! git push "$REMOTE" "${TEMP_BRANCH}:main"; then
  echo "⚠️  Push rechazado (normal si main del remoto ha divergido)." >&2
  echo "   Prueba: npm run sync:frontend:safe" >&2
  exit 1
fi

trap - EXIT
git branch -D "$TEMP_BRANCH"
echo "✅ Sync subtree completado."
