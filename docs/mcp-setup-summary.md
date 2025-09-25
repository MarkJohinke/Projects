# MCP Server Setup Summary

## Purpose
- Single MCP endpoint that exposes safe, named tools to ChatGPT for operating two Synology NAS devices over Tailscale.
- Centralize credentials, guardrails, and logging; keep ChatGPT free of secrets.

## Architecture
- DS423+ (or VM) runs Docker Compose stack:
  - `mcp-tailscale`: Tailscale sidecar (joins tailnet, provides network)
  - `mcp-server`: Node app (HTTP :8765, MCP WS :8766)
- Tailnet Peering recommended between `johinke-developments` and `johinke-personal`.
- SSH on port 22 to DS43+ (dev) and DS418play (personal).

## Implemented
- Node + Python scaffolding
- Env-driven config (.env, SSH key path)
- HTTP debug API: exec/read/write/check-raid
- MCP WebSocket tools:
  - nas.exec, nas.read, nas.write
  - nas.listDir, nas.move, nas.delete
  - nas.checkRaid
- Tests: `npm test` (HTTP + WS sanity)
- Docker: Dockerfile + docker-compose with Tailscale sidecar

## Next (planned)
- DSM HTTP tools (auth + File Station)
- Admin helpers: SMART, storage summary, docker list, log tail
- Optional: write audit log, exec allowlist, denylist for paths, streaming upload/download

