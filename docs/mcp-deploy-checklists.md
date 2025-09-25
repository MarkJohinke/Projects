# MCP Deploy Checklists

## Option A — Docker Compose on DS423+ (recommended)
1. Prepare on NAS
- Create folder: `/volume1/docker/mcp`
- Copy: `docker-compose.yml`, `Dockerfile`, `.env`, `src/`, `python_tools/`
- Create: `secrets/`, `data/tailscale/`
- Private key: `secrets/id_ed25519` (chmod 600), public key on both NAS `svc_mcp`

2. Start stack (SSH)
- `cd /volume1/docker/mcp`
- `TS_AUTHKEY=<tailscale-authkey> docker compose up -d --build`
- Verify: `docker ps` shows `mcp-tailscale`, `mcp-server`
- DSM → Container Manager shows both

3. Validate
- `docker compose logs -f mcp` → listeners on :8765/:8766, SSH health OK

## Option B — DSM UI (no Compose)
1. Build image
- DSM → Container Manager → Image → Build → select project → tag `mcp-server:latest`

2. Tailscale container
- Image `tailscale/tailscale:stable`, name `mcp-tailscale`
- Capabilities: NET_ADMIN, SYS_MODULE
- Env: `TS_AUTHKEY`, `TS_STATE_DIR=/var/lib/tailscale`, `TS_USERSPACE=true`
- Mounts: `/volume1/docker/mcp/data/tailscale` → `/var/lib/tailscale`, `/dev/net/tun` → `/dev/net/tun`
- Start (Running)

3. MCP container
- Image `mcp-server:latest`, name `mcp-server`
- Network: share with `mcp-tailscale`
- Env: `PORT=8765`, `MCP_PORT=8766`, NAS hosts/users/ports, `SSH_KEY_PATH=/run/secrets/id_ed25519`
- Mounts: `/volume1/docker/mcp/.env` → `/app/.env:ro`, `/volume1/docker/mcp/secrets/id_ed25519` → `/run/secrets/id_ed25519:ro`
- Start; Logs show listeners and SSH checks

## Cleanup
- Compose: `docker compose down`
- UI: stop/delete `mcp-*` containers, remove images
- Optional: remove `/volume1/docker/mcp/data/tailscale` (TS state), `secrets/id_ed25519`
- Revoke device in Tailscale admin

