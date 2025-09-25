#!/bin/sh
set -e

DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$DIR"

echo "[mcp] Using project at $DIR"

if [ ! -f "$DIR/docker-compose.yml" ]; then
  echo "docker-compose.yml not found in $DIR" >&2
  exit 1
fi

if [ ! -d "$DIR/secrets" ]; then
  echo "Creating secrets directory"
  mkdir -p "$DIR/secrets"
fi

if [ ! -d "$DIR/data/tailscale" ]; then
  echo "Creating tailscale state directory"
  mkdir -p "$DIR/data/tailscale"
fi

echo "[mcp] Rebuilding and restarting containers"
docker compose up -d --build

echo "[mcp] Current container status:"
docker compose ps

echo "[mcp] Tail logs with: docker compose logs -f mcp"

