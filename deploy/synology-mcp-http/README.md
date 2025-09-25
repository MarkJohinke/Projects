Synology DS423+ Container (HTTP MCP)

Overview
- Runs the minimal FastAPI MCP-compatible service from `synology-mcp-http` on DS423+.
- Exposes:
  - `/.well-known/mcp/health` (GET)
  - `/mcp/tools` (POST)
  - `/mcp/call/search` (POST)
  - `/mcp/call/fetch` (POST)

Prereqs
- DSM 7 with Container Manager installed.
- A shared folder on DS423+ containing your data (e.g., `/volume1/media`).

Quick Start (Compose)
1) Copy these folders to DS423+ (via File Station or SMB):
   - `synology-mcp-http/` (Dockerfile + server.py)
   - `deploy/synology-mcp-http/` (docker-compose.yml)
2) In Container Manager → Projects → Create → Import docker-compose.yml
   - Point to `deploy/synology-mcp-http/docker-compose.yml`.
   - Add an `.env` next to it (copy `.env.example`) and set:
     - `HOST_SHARE_PATH=/volume1/docker/Mounted`  ← your DS418play share mounted on DS423+
     - `HOST_PORT=8765` (or any free port)
3) Deploy.

Volume & Env
- Host path: `/volume1/<your_share>` mounted read-only into container at `/data`.
- Env: `NAS_PATH=/data` (container reads from /data)

Health Check
- Open: `http://<DS423+>:<HOST_PORT>/.well-known/mcp/health`
- Expect: `{ "ok": true }`

Tool Calls (examples)
- List tools: `POST http://<host>:<port>/mcp/tools` (empty JSON body)
- Search: `POST /mcp/call/search` with `{ "query": "report", "path": "." }`
- Fetch: `POST /mcp/call/fetch` with `{ "url": "file:///relative/path.txt" }`

Notes
- Bind mounts are read-only by default for safety.
- For multi-share access, add more `volumes` entries and adjust `NAS_PATH` usage or extend the app.

Tailscale Names (example)
- DS423+: `johinke-developments.zebra-mooneye.ts.net` → MCP URL `http://johinke-developments.zebra-mooneye.ts.net:8765`
- DS418play share mounted on DS423+: `//johinke-personal.zebra-mooneye.ts.net/Mounted` → local path `/volume1/docker/Mounted`
