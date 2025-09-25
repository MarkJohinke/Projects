# MCP Testing Guide (Simple Steps)

## 1) Prep
- Copy `.env.example` to `.env` and ensure NAS hosts/users and `SSH_KEY_PATH` are set.
- Place private key at `./secrets/id_ed25519` (public key on both NAS `svc_mcp`).

## 2) Start
- First run: `TS_AUTHKEY=<tailscale-authkey> docker compose up -d --build`
- Logs: `docker compose logs -f mcp` → look for listeners on :8765/:8766 and SSH checks code=0.

## 3) Auto tests
- Run: `npm test`
- Expect: PASS lines for HTTP exec/read/write and WS tools.list/exec/listDir.

## 4) Manual checks (optional)
- HTTP exec: POST to `/tools/exec` with `{ "target":"dev", "command":"uname -a" }`
- WS tools: connect `ws://<host>:8766` and send `{ "id":1, "method":"tools.list" }`

## Troubleshooting
- Tailscale auth: re-run compose with `TS_AUTHKEY`.
- SSH key/perm: verify `svc_mcp` and authorized_keys; SSH enabled on port 22.
- DNS: use Tailscale IPs for hosts if MagicDNS fails in container.
