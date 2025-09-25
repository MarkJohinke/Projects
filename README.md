# Projects Overview

[![CI](https://github.com/MarkJohinke/Projects/actions/workflows/ci.yml/badge.svg)](https://github.com/MarkJohinke/Projects/actions/workflows/ci.yml)
[![Lint](https://github.com/MarkJohinke/Projects/actions/workflows/lint.yml/badge.svg)](https://github.com/MarkJohinke/Projects/actions/workflows/lint.yml)

Last updated: 2025-09-25

This overview maps the projects under this workspace, their purpose, and near‑term next steps. Use it as the entry point for onboarding and planning.

## Directory Map

- property-dev-app — Monorepo with FastAPI backend and Next.js frontend. Docker/dev scripts, tests, Git.
- synology-mcp — Lightweight MCP servers over SSE/WebSocket with local + Synology DSM tools (Node.js, v1.0.0).
- synology-mcp-http — Python-based HTTP service packaged for Docker; health/tests.
- synology-mcp-http-node — Node-based HTTP variant packaged for Docker.
- mcp-http — DS423+ Container Manager project scaffolding + deployment docs (compose).
- mcp-http-node — DS423+ Container Manager project for the Node variant.
- windows-mcp — Windows-focused MCP utilities (venv present), tests.
- NSW Planning Portal API — Integration work for NSW Planning; used by property-dev-app backend.
- CodexTools, python_tools, Python313 — Dev utilities/experiments; some tests.
- Scripts — PowerShell helpers to start/stop/dev the monorepo services.
- services, apps, src — Workspace scaffolding for services/apps/source.
- docs, notes, deploy — Documentation and deployment assets.
- node_modules, .tmp, logs, tests — Ephemeral/support directories.

## Status & Next Steps

### Property Development App (property-dev-app)
- Current: Active. FastAPI backend + Next.js frontend. Docker compose and PowerShell scripts for dev/prod. Tests present. No CI pipeline detected.
- Next steps:
  - Add CI (lint/test/build) for backend and frontend.
  - Stabilize configuration via `.env` and `.env.sample` for both services.
  - Choose deploy target (Synology/VM/cloud); add DB + migrations and a staging environment.
  - Define MVP user flow (inputs → screening/feasibility → report) and add basic e2e tests.

### MCP Servers (synology-mcp, windows-mcp)
- Current: Active. Node SSE/WS MCP server with local + Synology DSM tools; Windows variant available; tests present.
- Next steps:
  - Unify configuration (auth, `BASE_DIR`, ports), add rate limiting and `/health` endpoints.
  - Add CI (build/test) and publish tagged images/packages.
  - Consider consolidating Windows/Synology variants behind env flags in a single codebase.

### MCP HTTP Deployments (synology-mcp-http, synology-mcp-http-node, mcp-http, mcp-http-node)
- Current: Active. Dockerfiles ready; DS423+ deployment instructions in `mcp-http`.
- Next steps:
  - Replace manual DS423+ deployment steps with `docker-compose.yml` + `.env` templates and a `deploy.ps1` helper.
  - Standardize health checks, logging, and secrets via Synology Container Manager variables.
  - Version/tag images and maintain simple release notes.

### NSW Planning Integration (NSW Planning Portal API)
- Current: Active. Referenced by property-dev-app.
- Next steps:
  - Extract a reusable client library (rate limiting, retries, caching) used by backend routes.
  - Lock initial endpoints (at-point, lot/DP, zoning) with tests/fixtures.
  - Document API keys/config in `.env.sample` and README.

## Common Tasks

### Run Property Dev App (local/dev)
```powershell
# From property-dev-app
./scripts/setup_backend.ps1
./scripts/dev_backend.ps1
./scripts/dev_frontend.ps1
```

### Run with Docker Compose
```powershell
# From property-dev-app
docker compose up -d backend
docker compose up -d frontend
```

### Deploy MCP HTTP on DS423+
1) Place the `mcp-http` folder on the NAS under `/volume1/projects/mcp-http`.
2) In Container Manager → Projects → Create, choose the compose path in `deploy/synology-mcp-http`.
3) Set variables: `HOST_SHARE_PATH=/volume1/docker/Mounted`, `HOST_PORT=8765`.
4) Verify: `http://<host>:8765/.well-known/mcp/health`.

## Conventions

- Environments: Prefer `.env` + `.env.sample` committed; never commit real secrets.
- CI: Add lint/test/build workflows for each active project; gated on PR.
- Versioning: Tag Docker images and npm packages; maintain CHANGELOG or release notes.
- Health: Expose `/health` and `/version` endpoints for all HTTP services.

## Open Questions

- Preferred deployment target for property-dev-app (Synology vs. cloud)?
- Database choice and migration tooling for backend?
- Single-repo consolidation for MCP variants vs. separate projects?
