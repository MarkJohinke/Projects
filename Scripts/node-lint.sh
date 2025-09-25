#!/bin/sh
set -e

if [ ! -f package.json ]; then
  echo "[node-lint] No package.json found. Skipping."
  exit 0
fi

if [ -f pnpm-lock.yaml ]; then
  PKG_MGR=pnpm
elif [ -f package-lock.json ]; then
  PKG_MGR=npm
else
  PKG_MGR=pnpm
fi

echo "[node-lint] Using $PKG_MGR"

if [ "$PKG_MGR" = "pnpm" ]; then
  pnpm -v || corepack prepare pnpm@9.12.3 --activate
  pnpm install --frozen-lockfile || pnpm install
  if npm run | grep -q " lint"; then
    pnpm lint
  else
    echo "[node-lint] No lint script in package.json. Skipping."
  fi
else
  if [ -f package-lock.json ]; then npm ci || npm install; else npm install; fi
  if npm run | grep -q " lint"; then
    npm run lint --silent || npm run lint
  else
    echo "[node-lint] No lint script in package.json. Skipping."
  fi
fi

echo "[node-lint] Done."

