#!/bin/sh
set -e

echo "[python-lint] Ensuring ruff is available..."
if ! command -v ruff >/dev/null 2>&1; then
  pip install --no-cache-dir ruff >/dev/null 2>&1 || true
fi

if ! command -v ruff >/dev/null 2>&1; then
  echo "[python-lint] Ruff not available. Skipping."
  exit 0
fi

# Prefer common code dirs if present
if [ -d src ] || [ -d tests ] || [ -d app ] || [ -d backend ]; then
  TARGETS=""
  [ -d src ] && TARGETS="$TARGETS src"
  [ -d tests ] && TARGETS="$TARGETS tests"
  [ -d app ] && TARGETS="$TARGETS app"
  [ -d backend ] && TARGETS="$TARGETS backend"
else
  TARGETS="${1:-.}"
fi

echo "[python-lint] Running ruff on:$TARGETS"
ruff check --no-cache $TARGETS || echo "[python-lint] Ruff found issues (non-blocking)."
echo "[python-lint] Done."
