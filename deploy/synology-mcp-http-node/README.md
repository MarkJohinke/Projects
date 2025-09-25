Synology DS423+ Container (HTTP MCP – Node, no deps)

Overview
- Minimal MCP-compatible HTTP service implemented in Node with no external packages.
- Endpoints:
  - `/.well-known/mcp/health` (GET)
  - `/mcp/tools` (POST)
  - `/mcp/call/search` (POST)
  - `/mcp/call/fetch` (POST)

Prereqs
- DS418play share mounted on DS423+: `/volume1/docker/Mounted`.

Quick Start (Compose)
1) Copy folders to DS423+:
   - `synology-mcp-http-node/`
   - `deploy/synology-mcp-http-node/`
2) Container Manager → Projects → Create → Import `deploy/synology-mcp-http-node/docker-compose.yml`.
3) Add `.env` next to compose (copy `.env.example`) and set:
   - `HOST_SHARE_PATH=/volume1/docker/Mounted`
   - `HOST_PORT=8765`
4) Deploy.

Health Check
- `http://<DS423+>:<HOST_PORT>/.well-known/mcp/health`

Notes
- Bind mount is read-only; service reads from `/data`.
- Uses only Node core modules (no network install step during build).

