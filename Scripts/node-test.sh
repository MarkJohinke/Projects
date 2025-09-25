#!/bin/sh
set -e

if [ ! -f package.json ]; then
  echo "[node-test] No package.json found. Skipping."
  exit 0
fi

if [ -f pnpm-lock.yaml ]; then
  PKG_MGR=pnpm
elif [ -f package-lock.json ]; then
  PKG_MGR=npm
else
  # default to pnpm if nothing detected
  PKG_MGR=pnpm
fi

echo "[node-test] Using $PKG_MGR"

if [ "$PKG_MGR" = "pnpm" ]; then
  pnpm -v || corepack prepare pnpm@9.12.3 --activate
  pnpm install --frozen-lockfile || pnpm install
  if npm run | grep -q " test"; then
    pnpm test
  else
    echo "[node-test] No test script in package.json. Skipping."
  fi
else
  npm --version >/dev/null 2>&1 || { echo "[node-test] npm not available"; exit 0; }
  if [ -f package-lock.json ]; then npm ci || npm install; else npm install; fi
  if npm run | grep -q " test"; then
    npm test --silent || npm test
  else
    echo "[node-test] No test script in package.json. Skipping."
  fi
fi

echo "[node-test] Done."

