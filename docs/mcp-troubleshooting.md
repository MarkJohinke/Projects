# MCP Troubleshooting

- Tailscale container not running
  - Check TS_AUTHKEY provided on first run.
  - Ensure `/dev/net/tun` is mounted and capabilities NET_ADMIN, SYS_MODULE are set.
  - Logs: DSM → Container Manager → mcp-tailscale → Logs.

- MCP cannot reach NAS
  - Verify Tailnet Peering (if using two tailnets) and ACLs allow MCP to reach port 22.
  - Try using Tailscale IPs in `.env` instead of MagicDNS.

- SSH auth fails
  - Ensure SSH enabled on DSM (port 22) and `svc_mcp` exists.
  - Public key in `~svc_mcp/.ssh/authorized_keys`; private key mounted as `/run/secrets/id_ed25519`.

- HTTP/WS ports not reachable
  - Confirm `mcp-server` is running and logs show `:8765` and `:8766` listeners.
  - If using DSM UI port mapping, ensure none (network is shared with tailscale container).

- Write operations fail
  - Start by writing to `/tmp` to avoid permission issues.
  - Check file share permissions and user ownership.

- Containers not visible in DSM
  - Ensure you deployed on DS423+ itself, not another host.
  - `docker ps` via SSH should list `mcp-*` containers on the NAS.
