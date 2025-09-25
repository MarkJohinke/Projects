import { getConfig } from "./feature/mcp/config.js";
import { runSshCommand } from "./feature/mcp/ssh.js";
import { sftpReadFile, sftpWriteFile } from "./feature/mcp/sftp.js";
import { startServer } from "./feature/mcp/server.js";
import { startMcpWs } from "./feature/mcp/mcp-server.js";
import http from "http";
import https from "https";
import WebSocket from "ws";
import fs from "fs";
import path from "path";
import { appendTranscript } from "./feature/logging/transcript-logger.js";
import { readTranscripts } from "./feature/logging/transcript-reader.js";

async function selfTest() {
  const cfg = getConfig();
  // Local temp/fixtures setup
  const repoRoot = process.cwd();
  const localTmpDir = path.join(repoRoot, ".tmp");
  const fixturesDir = process.env.SELFTEST_FIXTURES_DIR || path.join(repoRoot, "tests", "fixtures");
  const localMarkerPath = process.env.SELFTEST_LOCAL_PATH || path.join(localTmpDir, "selftest-OK");
  try { fs.mkdirSync(localTmpDir, { recursive: true }); } catch {}
  try { fs.mkdirSync(fixturesDir, { recursive: true }); } catch {}
  // ensure a small fixture exists for HTTP read/scan endpoints
  const fixtureFile = path.join(fixturesDir, "sample.txt");
  try { if (!fs.existsSync(fixtureFile)) fs.writeFileSync(fixtureFile, "fixture-sample\n"); } catch {}
  // ensure local marker file exists for clarity
  try { if (!fs.existsSync(localMarkerPath)) fs.writeFileSync(localMarkerPath, "selftest-OK"); } catch {}
  if (process.argv.includes("--print-paths")) {
    console.log("Self-test paths:", JSON.stringify({ repoRoot, localTmpDir, fixturesDir, localMarkerPath }, null, 2));
  }
  // Local-only mode: skip remote SSH/SFTP/HTTP/WS checks
  if (process.argv.includes("--local-only")) {
    console.log(JSON.stringify({ ok: true, localOnly: true, paths: { repoRoot, localTmpDir, fixturesDir, localMarkerPath } }, null, 2));
    return;
  }
  const checks = [
    { name: "dev", target: cfg.dev },
    { name: "personal", target: cfg.personal },
    ...(cfg.yoga?.host ? [{ name: "yoga", target: cfg.yoga }] : []),
  ];
  // Per-target overrides with sensible defaults
  const getRemoteDir = (name) => {
    if (name === "dev") return process.env.TEST_REMOTE_DIR_DEV || process.env.TEST_REMOTE_DIR || "/tmp";
    if (name === "personal") return process.env.TEST_REMOTE_DIR_PERSONAL || process.env.TEST_REMOTE_DIR || "/volume1/public/tmp";
    if (name === "yoga") return process.env.TEST_REMOTE_DIR_YOGA || process.env.TEST_REMOTE_DIR || "/tmp";
    return process.env.TEST_REMOTE_DIR || "/tmp";
  };
  const getScanDir = (name) => {
    if (name === "dev") return process.env.SELFTEST_REMOTE_SCAN_DIR_DEV || process.env.SELFTEST_REMOTE_SCAN_DIR || "/tmp";
    if (name === "personal") return process.env.SELFTEST_REMOTE_SCAN_DIR_PERSONAL || process.env.SELFTEST_REMOTE_SCAN_DIR || "/volume1/public/tmp";
    if (name === "yoga") return process.env.SELFTEST_REMOTE_SCAN_DIR_YOGA || process.env.SELFTEST_REMOTE_SCAN_DIR || "/tmp";
    return process.env.SELFTEST_REMOTE_SCAN_DIR || "/tmp";
  };
  const wroteFiles = {};
  const results = {};
  for (const c of checks) {
    results[c.name] = { ssh: null, read: null, write: null };
    try {
      const { code } = await runSshCommand(c.target, cfg.sshKeyPath, "echo ok");
      results[c.name].ssh = code === 0 ? "PASS" : `FAIL(code=${code})`;
    } catch (e) {
      results[c.name].ssh = `ERROR(${e.message})`;
    }
    try {
      const remoteDir = getRemoteDir(c.name);
      // ensure directory exists
      await runSshCommand(c.target, cfg.sshKeyPath, `mkdir -p -- "${remoteDir.replaceAll('"','\\"')}"`);
      const tmp = `${remoteDir}/mcp-selftest-${Date.now()}.txt`;
      const content = Buffer.from("selftest-OK", "utf8");
      await sftpWriteFile(c.target, cfg.sshKeyPath, tmp, content);
      const buf = await sftpReadFile(c.target, cfg.sshKeyPath, tmp);
      results[c.name].write = "PASS";
      results[c.name].read = buf.toString("utf8") === "selftest-OK" ? "PASS" : "MISMATCH";
      wroteFiles[c.name] = tmp;
      // keep test file so HTTP /tools/read can validate; cleanup can be done manually
    } catch (e) {
      results[c.name].write = results[c.name].write || `ERROR(${e.message})`;
      results[c.name].read = results[c.name].read || `ERROR(${e.message})`;
    }
  }
  // Try local HTTP/WS endpoints if server is running
  const httpUrl = process.env.TEST_HTTP_URL || "http://localhost:8765";
  const wsUrl = process.env.TEST_WS_URL || (cfg.tls?.enabled ? "wss://localhost:8766" : "ws://localhost:8766");
  const apiToken = process.env.API_TOKEN || "";
  async function httpPost(path, body) {
    return new Promise((resolve, reject) => {
      const data = Buffer.from(JSON.stringify(body));
      const url = new URL(path, httpUrl);
      const req = http.request({
        method: "POST",
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
          ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
        },
      }, (res) => {
        let chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const txt = Buffer.concat(chunks).toString("utf8");
          try { resolve({ status: res.statusCode, json: JSON.parse(txt) }); }
          catch { resolve({ status: res.statusCode, text: txt }); }
        });
      });
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }
  const httpWs = { http: {}, ws: {} };
  try {
    httpWs.http.execDev = await httpPost("/tools/exec", { target: "dev", command: "uname -a" });
  } catch (e) { httpWs.http.execDev = { error: e.message }; }
  try {
    const devScanDir = getScanDir("dev");
    httpWs.http.scanDev = await httpPost("/housekeeping/scan", { target: "dev", dir: devScanDir, minSizeMB: 1, olderThanDays: 1 });
  } catch (e) { httpWs.http.scanDev = { error: e.message }; }
  try {
    // Read paths we know are accessible: use the tmp file we just created per-target
    if (wroteFiles.dev) {
      httpWs.http.readDev = await httpPost("/tools/read", { target: "dev", remotePath: wroteFiles.dev });
    }
  } catch (e) { httpWs.http.readDev = { error: e.message }; }
  try {
    if (wroteFiles.personal) {
      httpWs.http.readPersonal = await httpPost("/tools/read", { target: "personal", remotePath: wroteFiles.personal });
    }
  } catch (e) { httpWs.http.readPersonal = { error: e.message }; }
  try {
    const ws = new WebSocket(wsUrl, { rejectUnauthorized: false });
    await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });
    function wsCall(msg) {
      return new Promise((resolve) => { ws.once("message", (d) => resolve(JSON.parse(d.toString()))); ws.send(JSON.stringify(msg)); });
    }
    if (apiToken) await wsCall({ id: 0, auth: { token: apiToken } });
    httpWs.ws.tools = await wsCall({ id: 1, method: "tools.list" });
    httpWs.ws.exec = await wsCall({ id: 2, method: "nas.exec", params: { target: "dev", command: "uname -a" } });
    ws.close();
  } catch (e) { httpWs.ws.error = e.message; }

  console.log(JSON.stringify({ ok: true, results, endpoints: httpWs }, null, 2));
}

async function main() {
  const cfg = getConfig();
  const checks = [
    { name: "dev", target: cfg.dev },
    { name: "personal", target: cfg.personal },
    ...(cfg.yoga?.host ? [{ name: "yoga", target: cfg.yoga }] : []),
  ];

  for (const c of checks) {
    const { code, stdout, stderr } = await runSshCommand(
      c.target,
      cfg.sshKeyPath,
      "uname -a"
    );
    console.log(`SSH ${c.name} -> code=${code}`);
    if (stdout) console.log(stdout.trim());
    if (stderr) console.error(stderr.trim());
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

async function cmdLog(argv) {
  const args = parseArgs(argv);
  const role = args.role || args.r;
  const text = args.text || args.t;
  if (!role || !text) {
    console.error("Usage: node src/index.js log --role <user|assistant|system> --text <message> [--meta k=v,k2=v2] [--dir <path>]");
    process.exit(2);
  }
  const meta = {};
  if (args.meta) {
    String(args.meta)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .forEach((kv) => {
        const idx = kv.indexOf("=");
        if (idx > 0) meta[kv.slice(0, idx)] = kv.slice(idx + 1);
      });
  }
  const entry = { role, text, meta };
  const file = await appendTranscript(entry, { dir: args.dir });
  console.log(file);
}

async function loadEntries(args) {
  const readerArgs = {
    dir: args.dir,
    all: !!args.all,
    date: args.date,
    dateFrom: args["date-from"],
    dateTo: args["date-to"],
    days: args.days ? Number(args.days) : undefined,
    role: args.role,
    contains: args.contains,
    limit: args.limit ? Number(args.limit) : undefined,
    since: args.since,
  };
  if (args.weekly && !readerArgs.days && !readerArgs.date && !readerArgs.dateFrom && !readerArgs.dateTo) {
    readerArgs.days = 7;
  }
  const entries = await readTranscripts(readerArgs);
  return entries;
}

async function cmdLogRead(argv) {
  const args = parseArgs(argv);
  const entries = await loadEntries(args);
  if (args.json) {
    console.log(JSON.stringify(entries, null, 2));
  } else {
    for (const e of entries) {
      console.log(`[${e.ts}] ${e.role}: ${e.text}`);
    }
  }
}

async function cmdLogSummary(argv) {
  const args = parseArgs(argv);
  const entries = await loadEntries(args);
  const byRole = {};
  let firstTs = null;
  let lastTs = null;
  for (const e of entries) {
    byRole[e.role] = (byRole[e.role] || 0) + 1;
    const ts = Date.parse(e.ts);
    if (!firstTs || ts < firstTs) firstTs = ts;
    if (!lastTs || ts > lastTs) lastTs = ts;
  }
  const summary = {
    total: entries.length,
    byRole,
    firstTs: firstTs ? new Date(firstTs).toISOString() : null,
    lastTs: lastTs ? new Date(lastTs).toISOString() : null,
  };
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Total entries: ${summary.total}`);
    console.log(`By role: ${Object.entries(byRole).map(([k, v]) => `${k}=${v}`).join(", ") || "-"}`);
    console.log(`First: ${summary.firstTs || "-"}`);
    console.log(`Last: ${summary.lastTs || "-"}`);
  }
}

function countWords(text) {
  return (String(text).trim().match(/\S+/g) || []).length;
}

async function cmdLogTokens(argv) {
  const args = parseArgs(argv);
  const entries = await loadEntries(args);
  const mode = (args.mode || "chars4").toLowerCase();
  const includeMeta = !!args["include-meta"];
  let totalChars = 0;
  let totalWords = 0;
  for (const e of entries) {
    const base = String(e.text || "");
    totalChars += base.length;
    totalWords += countWords(base);
    if (includeMeta && e.meta && typeof e.meta.text === "string") {
      totalChars += e.meta.text.length;
      totalWords += countWords(e.meta.text);
    }
  }
  let approxTokens;
  if (mode === "words") {
    approxTokens = totalWords;
  } else {
    approxTokens = Math.round(totalChars / 4);
  }
  const out = { mode, totalChars, totalWords, approxTokens, entries: entries.length };
  if (args.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`Mode=${mode} Entries=${out.entries} Chars=${totalChars} Words=${totalWords} ~Tokens=${approxTokens}`);
  }
}

async function cmdMcpHealth(argv) {
  const args = parseArgs(argv);
  const urlStr = args.url || "http://localhost:8765";
  const url = new URL("/health", urlStr);
  const client = url.protocol === "https:" ? https : http;
  await new Promise((resolve, reject) => {
    const req = client.request({
      method: "GET",
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname,
      rejectUnauthorized: false,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const txt = Buffer.concat(chunks).toString("utf8");
        try {
          const json = JSON.parse(txt);
          console.log(JSON.stringify(json, null, 2));
        } catch {
          console.log(txt);
        }
        resolve();
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function cmdHttpExec(argv) {
  const args = parseArgs(argv);
  const baseUrl = args.url || process.env.HTTP_BASE_URL || "http://localhost:8765";
  const target = args.target || args.t;
  const command = args.command || args.c;
  const token = args.token || process.env.API_TOKEN || "";
  if (!target || !command) {
    console.error("Usage: node src/index.js http-exec --target <dev|personal|yoga> --command \"uname -a\" [--url http://host:8765] [--token <token>]");
    process.exit(2);
  }
  const url = new URL("/tools/exec", baseUrl);
  const payload = { target, command };
  const client = url.protocol === "https:" ? https : http;
  await new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload));
    const req = client.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const txt = Buffer.concat(chunks).toString("utf8");
          try {
            const json = JSON.parse(txt);
            console.log(JSON.stringify(json, null, 2));
          } catch {
            console.log(txt);
          }
          if (res.statusCode && res.statusCode >= 400) process.exit(1);
          resolve();
        });
      }
    );
    req.on("error", (e) => {
      console.error("Request failed:", e.message);
      reject(e);
    });
    req.write(data);
    req.end();
  });
}

function printHelp() {
  console.log(`Codex Playground CLI\n\n` +
    `Usage:\n` +
    `  node src/index.js [--no-ssh-check]            Start HTTP/WS servers (skips SSH probe with flag)\n` +
    `  node src/index.js self-test [--print-paths]   Run connectivity + SFTP self-test\n` +
    `  node src/index.js mcp-health [--url URL]      Check /health endpoint\n` +
    `  node src/index.js http-exec --target T --command C [--url URL] [--token TOKEN]\n` +
    `  node src/index.js log --role R --text T [--meta k=v,...] [--dir DIR]\n` +
    `  node src/index.js log-read [--date YYYY-MM-DD | --days N | --weekly] [--role R] [--contains S] [--limit N] [--json] [--dir DIR]\n` +
    `  node src/index.js log-summary [--date ... | --days N | --weekly] [--json] [--dir DIR]\n` +
    `  node src/index.js log-tokens [--days N | --weekly] [--mode chars4|words] [--include-meta] [--json] [--dir DIR]\n\n` +
    `Flags:\n` +
    `  --no-ssh-check     Skip initial SSH probe on startup (or NO_SSH_CHECK=1)\n` +
    `  --help, -h         Show this help\n`);
}

const arg = process.argv[2];
const globalArgs = (() => {
  try { return parseArgs(process.argv.slice(2)); } catch { return {}; }
})();
if (globalArgs.help || globalArgs.h || arg === "help") {
  printHelp();
  process.exit(0);
}
if (arg === "self-test") {
  selfTest().catch((err) => {
    console.error("Self-test failed:", err.message);
    process.exit(1);
  });
} else if (arg === "log") {
  cmdLog(process.argv.slice(3)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (arg === "log-read") {
  cmdLogRead(process.argv.slice(3)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (arg === "log-summary") {
  cmdLogSummary(process.argv.slice(3)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (arg === "log-tokens") {
  cmdLogTokens(process.argv.slice(3)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (arg === "mcp-health") {
  cmdMcpHealth(process.argv.slice(3)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else if (arg === "http-exec") {
  cmdHttpExec(process.argv.slice(3)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  if (!(globalArgs["no-ssh-check"] || process.env.NO_SSH_CHECK === "1" || process.env.NO_SSH_CHECK === "true")) {
    main().catch((err) => {
      console.error("Fatal:", err.message);
      process.exit(1);
    });
  }
  startServer();
  startMcpWs();
}
