Title: MCP connectors setup and self-test fixes (2025-09-23)

Summary
- Standardized self-test to use repo-local fixtures and configurable remote paths.
- Ensured HTTP/WS endpoints are SFTP/SSH-only; no local FS fallbacks.
- Added minimal test to verify local marker and fixtures.
- Documented env vars and added a flag to print active self-test paths.

Key Paths
- Local marker: ./.tmp/selftest-OK (override: SELFTEST_LOCAL_PATH)
- Fixtures dir: ./tests/fixtures (override: SELFTEST_FIXTURES_DIR)
- Remote temp dir for SFTP roundtrip (override: TEST_REMOTE_DIR)
  - Recommended: /var/services/homes/svc_mcp/tmp
- Remote read file (override: SELFTEST_REMOTE_READ)
  - Recommended: /proc/version
- Remote scan dir (override: SELFTEST_REMOTE_SCAN_DIR)
  - Recommended: /tmp

Environment (.env)
- DEV_NAS_HOST, DEV_NAS_PORT=22, DEV_NAS_USER=svc_mcp
- PERSONAL_NAS_HOST, PERSONAL_NAS_PORT=22, PERSONAL_NAS_USER=svc_mcp
- SSH_KEY_PATH=C:\\Users\\MarkJ\\.ssh\\id_ed25519
- API_TOKEN= (optional)
- TEST_REMOTE_DIR=/var/services/homes/svc_mcp/tmp
- SELFTEST_REMOTE_READ=/proc/version
- SELFTEST_REMOTE_SCAN_DIR=/tmp

Server
- Start: npm start (HTTP :8765, WS :8766)
- Self-test: npm run self-test
- Print paths: node src/index.js self-test --print-paths

PowerShell-safe curl examples
- Create per-user tmp (dev):
  curl --% -s -X POST http://localhost:8765/tools/exec -H "Content-Type: application/json" -d "{\"target\":\"dev\",\"command\":\"mkdir -p /var/services/homes/svc_mcp/tmp && ls -ld /var/services/homes/svc_mcp/tmp\"}"
- Create per-user tmp (personal):
  curl --% -s -X POST http://localhost:8765/tools/exec -H "Content-Type: application/json" -d "{\"target\":\"personal\",\"command\":\"mkdir -p /var/services/homes/svc_mcp/tmp && ls -ld /var/services/homes/svc_mcp/tmp\"}"
- Read file (dev):
  curl --% -s -X POST http://localhost:8765/tools/read -H "Content-Type: application/json" -d "{\"target\":\"dev\",\"remotePath\":\"/proc/version\"}"
- Write file (dev):
  curl --% -s -X POST http://localhost:8765/tools/write -H "Content-Type: application/json" -d "{\"target\":\"dev\",\"remotePath\":\"/var/services/homes/svc_mcp/tmp/test.txt\",\"content\":\"hello\",\"encoding\":\"utf8\"}"
- Scan dir (dev):
  curl --% -s -X POST http://localhost:8765/housekeeping/scan -H "Content-Type: application/json" -d "{\"target\":\"dev\",\"dir\":\"/var/services/homes/svc_mcp/tmp\",\"minSizeMB\":1,\"olderThanDays\":1}"

Troubleshooting
- If self-test shows "No such file" for write/read:
  - Ensure TEST_REMOTE_DIR exists via tools.exec mkdir.
  - Use home tmp path for svc_mcp.
- If HTTP read 400:
  - Set SELFTEST_REMOTE_READ to a readable file (/proc/version).
- If servers not reachable:
  - Restart: Ctrl+C then npm start; run self-test in a new terminal.

Repo changes
- src/index.js: local fixtures/marker creation; --print-paths flag; env overrides for endpoints.
- .env.example: added self-test vars.
- tests/run-tests.js: asserts local marker and fixtures present.
- README.md: Self-Test section and env documentation.

