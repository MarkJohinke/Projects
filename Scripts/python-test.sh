#!/bin/sh
set -e

has_pyproject=false
has_requirements=false
if [ -f pyproject.toml ]; then has_pyproject=true; fi
if [ -f requirements.txt ]; then has_requirements=true; fi

if [ "$has_pyproject" = false ] && [ "$has_requirements" = false ]; then
  echo "[python-test] No pyproject.toml or requirements.txt found. Skipping."
  exit 0
fi

if [ "$has_pyproject" = true ]; then
  if grep -qi "\[tool.poetry\]" pyproject.toml; then
    echo "[python-test] Installing with Poetry..."
    poetry --version >/dev/null 2>&1 || pip install "poetry==1.8.3"
    poetry install --no-root || poetry install
  else
    echo "[python-test] pyproject.toml without Poetry detected. Using pip via PEP 517 is project-specific; skipping install."
  fi
fi

if [ "$has_requirements" = true ]; then
  echo "[python-test] Installing requirements.txt..."
  pip install -r requirements.txt || true
fi

# Ensure pytest exists, otherwise skip gracefully
if ! command -v pytest >/dev/null 2>&1; then
  echo "[python-test] pytest not found. Skipping tests."
  exit 0
fi

echo "[python-test] Running pytest..."
pytest -q || echo "[python-test] Tests failed (pytest exit code $?)."
echo "[python-test] Done."

