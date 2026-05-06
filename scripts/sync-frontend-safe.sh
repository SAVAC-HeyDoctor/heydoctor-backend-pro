#!/usr/bin/env bash
# Sincronización segura cuando main del frontal público no acepta fast-forward:
# subtree split → rama desde jairo-fe/main → merge --squash (historias no relacionadas)
# → commit → push → vuelta a main.
#
# Si hay conflictos, el script termina en error; resuélvelos en la rama temporal,
# haz commit y push manualmente, luego borra esa rama.
#
# Opcional: SKIP_CHECK=1 omite lint/build del frontend.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REMOTE="${REMOTE:-jairo-fe}"
TEMP_BRANCH="${TEMP_BRANCH:-frontend-sync-temp}"
WORK_BRANCH="${WORK_BRANCH:-jairo-sync-auto}"
JAIRO_FE_URL="${JAIRO_FE_URL:-https://github.com/jairosc23/heydoctor-frontend.git}"
START_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

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

abort_to_start() {
  local had_error="${1:-0}"
  git merge --abort 2>/dev/null || true
  git checkout "$START_BRANCH" 2>/dev/null || git checkout main
  git branch -D "$WORK_BRANCH" 2>/dev/null || true
  git branch -D "$TEMP_BRANCH" 2>/dev/null || true
  if [[ "$had_error" != "0" ]]; then
    exit "$had_error"
  fi
}

ensure_remote
require_clean_repo
run_frontend_checks

echo "📥 git fetch $REMOTE"
git fetch "$REMOTE"

echo "🌳 git subtree split --prefix=frontend → $TEMP_BRANCH"
git branch -D "$TEMP_BRANCH" 2>/dev/null || true
git subtree split --prefix=frontend -b "$TEMP_BRANCH"

if ! git show-ref --verify --quiet "refs/heads/$TEMP_BRANCH"; then
  echo "❌ subtree split no creó la rama $TEMP_BRANCH" >&2
  exit 1
fi

echo "🔀 Rama de trabajo desde $REMOTE/main → $WORK_BRANCH"
git branch -D "$WORK_BRANCH" 2>/dev/null || true
git checkout -b "$WORK_BRANCH" "${REMOTE}/main"

set +e
git merge --allow-unrelated-histories --squash "$TEMP_BRANCH"
merge_rc=$?
set -e

if [[ "$merge_rc" -ne 0 ]]; then
  echo "❌ Merge squash falló (conflictos o error). Estado en rama $WORK_BRANCH." >&2
  echo "   Resuelve, luego: git commit && git push $REMOTE ${WORK_BRANCH}:main" >&2
  echo "   Después vuelve: git checkout $START_BRANCH && git branch -D $WORK_BRANCH $TEMP_BRANCH" >&2
  exit 1
fi

if git diff-index --quiet --cached HEAD -- && git diff-files --quiet; then
  echo "ℹ️  Sin cambios respecto al remoto; nada que commitear."
  abort_to_start 0
  echo "✅ Repo público ya alineado (sin commit nuevo)."
  exit 0
fi

TS="$(date -u +%Y-%m-%dT%H:%MZ)"
git commit -m "sync(frontend): mirror from monorepo (${TS})"

echo "📤 Push → $REMOTE main"
if ! git push "$REMOTE" "${WORK_BRANCH}:main"; then
  echo "❌ Push rechazado. Rama $WORK_BRANCH conservada; reintenta: git push $REMOTE ${WORK_BRANCH}:main" >&2
  exit 1
fi

git checkout "$START_BRANCH"
git branch -D "$WORK_BRANCH"
git branch -D "$TEMP_BRANCH"

echo "✅ Sync seguro completado."
