import express from "express";
import bodyParser from "body-parser";
import { getConfig } from "./config.js";
import { runSshCommand } from "./ssh.js";
import { sftpReadFile, sftpWriteFile, sftpListDir, sftpDeleteFile } from "./sftp.js";
import { dsm } from "./dsm.js";
import { appendAudit } from "../logging/audit-logger.js";
import { isCommandAllowed, commandProgram } from "./exec-policy.js";
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";

const app = express();
app.use(bodyParser.json({ limit: "5mb" }));

const cfg = getConfig();

function resolveTarget(name) {
  if (name === "dev") return cfg.dev;
  if (name === "personal") return cfg.personal;
  if (name === "yoga" && cfg.yoga?.host) return cfg.yoga;
  throw new Error("unknown target");
}

// Local FS guards
function resolveLocalPath(p) {
  const base = cfg.local?.baseDir || process.cwd();
  const allowAbs = !!cfg.local?.allowAbs;
  const allowlist = cfg.local?.allowlist || [];
  let abs = p;
  if (!path.isAbsolute(abs)) {
    abs = path.resolve(base, p);
  } else if (!allowAbs) {
    // block absolute paths unless explicitly allowed or within base
    const withinBase = abs.toLowerCase().startsWith(path.resolve(base).toLowerCase());
    if (!withinBase) throw new Error("absolute path not allowed");
  }
  if (allowlist.length > 0) {
    const ok = allowlist.some((prefix) => abs.toLowerCase().startsWith(path.resolve(prefix).toLowerCase()));
    if (!ok) throw new Error("path not in allowlist");
  }
  return abs;
}

// Optional API token
app.use((req, res, next) => {
  if (!cfg.apiToken) return next();
  const h = req.headers["authorization"] || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (token !== cfg.apiToken) return res.status(401).json({ error: "unauthorized" });
  next();
});

// MCP-like minimal HTTP endpoints representing tools
// Basic health endpoint
app.get("/health", (req, res) => {
  try {
    const targets = ["dev", "personal", ...(cfg.yoga?.host ? ["yoga"] : [])];
    res.json({
      ok: true,
      ts: new Date().toISOString(),
      name: "mcp-http",
      tls: !!cfg.tls?.enabled,
      auth: !!cfg.apiToken,
      targets,
      execAllowlist: cfg.exec?.allowlist || [],
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 1) Execute arbitrary safe command
app.post("/tools/exec", async (req, res) => {
  try {
    const { target, command } = req.body || {};
    if (!target || !command) return res.status(400).json({ error: "target and command required" });
    if (!isCommandAllowed(command, cfg)) {
      if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/exec", ok: false, reason: "not_allowed", program: commandProgram(command) }, { dir: cfg.audit.dir });
      return res.status(403).json({ error: "command not allowed" });
    }
    const t = resolveTarget(target);
    const t0 = Date.now();
    const out = await runSshCommand(t, cfg.sshKeyPath, command);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/exec", target, ok: true, code: out.code, durMs: Date.now()-t0, command: String(command).slice(0, 200) }, { dir: cfg.audit.dir });
    res.json(out);
  } catch (e) {
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/exec", ok: false, error: e.message }, { dir: cfg.audit.dir });
    res.status(500).json({ error: e.message });
  }
});

// 2) Read file via SFTP
app.post("/tools/read", async (req, res) => {
  try {
    const { target, remotePath } = req.body || {};
    if (!target || !remotePath) return res.status(400).json({ error: "target and remotePath required" });
    const t = resolveTarget(target);
    // First try SFTP (binary-safe), then fallback to SSH cat if SFTP cannot access path
    try {
      const t0 = Date.now();
      const data = await sftpReadFile(t, cfg.sshKeyPath, remotePath);
      let contentUtf8;
      try { contentUtf8 = data.toString("utf8"); } catch { /* noop */ }
      if (contentUtf8 && /^[\s\S]*$/.test(contentUtf8)) {
        if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/read", target, ok: true, durMs: Date.now()-t0, remotePath, via: "sftp" }, { dir: cfg.audit.dir });
        return res.json({ content: contentUtf8, encoding: "utf8" });
      }
      if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/read", target, ok: true, durMs: Date.now()-t0, remotePath, binary: true, via: "sftp" }, { dir: cfg.audit.dir });
      return res.json({ content: data.toString("base64"), encoding: "base64" });
    } catch (e) {
      // Fallback: SSH cat for paths outside SFTP chroot (e.g., /proc/*)
      try {
        const t1 = Date.now();
        const esc = String(remotePath).replaceAll('"','\\"');
        const out = await runSshCommand(t, cfg.sshKeyPath, `cat -- "${esc}"`);
        if (out.code === 0) {
          if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/read", target, ok: true, durMs: Date.now()-t1, remotePath, via: "ssh-cat" }, { dir: cfg.audit.dir });
          return res.json({ content: out.stdout || "", encoding: "utf8" });
        }
        if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/read", target, ok: false, remotePath, via: "ssh-cat", code: out.code }, { dir: cfg.audit.dir });
        return res.status(400).json({ error: out.stderr || `read failed (code=${out.code})` });
      } catch (e2) {
        if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/read", target, ok: false, error: e2.message, remotePath, via: "ssh-cat" }, { dir: cfg.audit.dir });
        return res.status(400).json({ error: e.message });
      }
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3) Write file via SFTP (utf8 or base64)
app.post("/tools/write", async (req, res) => {
  try {
    const { target, remotePath, content, encoding } = req.body || {};
    if (!target || !remotePath || typeof content !== "string") return res.status(400).json({ error: "target, remotePath, content required" });
    const t = resolveTarget(target);
    const t0 = Date.now();
    const buf = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
    await sftpWriteFile(t, cfg.sshKeyPath, remotePath, buf);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/write", target, ok: true, durMs: Date.now()-t0, remotePath, bytes: buf.length }, { dir: cfg.audit.dir });
    return res.json({ ok: true });
  } catch (e) {
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/write", ok: false, error: e.message }, { dir: cfg.audit.dir });
    res.status(500).json({ error: e.message });
  }
});

// 3b) Delete file via SFTP (file only)
app.post("/tools/delete", async (req, res) => {
  try {
    const { target, remotePath } = req.body || {};
    if (!target || !remotePath) return res.status(400).json({ error: "target and remotePath required" });
    const t = resolveTarget(target);
    const t0 = Date.now();
    await sftpDeleteFile(t, cfg.sshKeyPath, remotePath);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/delete", target, ok: true, durMs: Date.now()-t0, remotePath }, { dir: cfg.audit.dir });
    return res.json({ ok: true });
  } catch (e) {
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/delete", ok: false, error: e.message }, { dir: cfg.audit.dir });
    res.status(500).json({ error: e.message });
  }
});

// 4) Python helper: check_raid (runs remotely if present, else locally example)
app.post("/tools/check-raid", async (req, res) => {
  try {
    const { target } = req.body || {};
    if (!target) return res.status(400).json({ error: "target required" });
    const t = resolveTarget(target);
    const cmd = "python3 - <<'PY'\nimport json,subprocess\nprint(subprocess.run(['cat','/proc/mdstat'], capture_output=True, text=True).stdout)\nPY";
    const t0 = Date.now();
    const out = await runSshCommand(t, cfg.sshKeyPath, cmd);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/check-raid", target, ok: true, code: out.code, durMs: Date.now()-t0 }, { dir: cfg.audit.dir });
    res.json(out);
  } catch (e) {
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/tools/check-raid", ok: false, error: e.message }, { dir: cfg.audit.dir });
    res.status(500).json({ error: e.message });
  }
});

// 5) Housekeeping: list large/old files under a directory (non-recursive or shallow)
app.post("/housekeeping/scan", async (req, res) => {
  try {
    const { target, dir, minSizeMB = 250, olderThanDays = 365 } = req.body || {};
    if (!target || !dir) return res.status(400).json({ error: "target and dir required" });
    const t = resolveTarget(target);
    const t0 = Date.now();
    const items = await sftpListDir(t, cfg.sshKeyPath, dir);
    const now = Math.floor(Date.now() / 1000);
    const minBytes = Number(minSizeMB) * 1024 * 1024;
    const olderThan = Number(olderThanDays) * 24 * 3600;
    const matches = (items || []).map((e) => ({
      name: e.name,
      size: e.attrs?.size ?? 0,
      mtime: e.attrs?.mtime ?? 0,
      isLarge: (e.attrs?.size ?? 0) >= minBytes,
      isOld: (now - (e.attrs?.mtime ?? now)) >= olderThan,
    })).filter((x) => x.isLarge || x.isOld);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/housekeeping/scan", target, ok: true, durMs: Date.now()-t0, dir, matches: matches.length }, { dir: cfg.audit.dir });
    res.json({ items: matches, dir, minSizeMB, olderThanDays });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 6) Housekeeping: duplicate candidates in a directory by size+name (heuristic)
app.post("/housekeeping/dupes", async (req, res) => {
  try {
    const { target, dir } = req.body || {};
    if (!target || !dir) return res.status(400).json({ error: "target and dir required" });
    const t = resolveTarget(target);
    const t0 = Date.now();
    const items = await sftpListDir(t, cfg.sshKeyPath, dir);
    const files = (items || []).filter((e) => e.attrs?.size >= 0);
    const map = new Map();
    for (const f of files) {
      const key = `${f.name}|${f.attrs?.size ?? 0}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ name: f.name, size: f.attrs?.size, mtime: f.attrs?.mtime });
    }
    const groups = [...map.values()].filter((g) => g.length > 1);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/housekeeping/dupes", target, ok: true, durMs: Date.now()-t0, dir, groups: groups.length }, { dir: cfg.audit.dir });
    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DSM endpoints (optional configuration)
app.post("/dsm/login", async (req, res) => {
  try {
    const { target } = req.body || {};
    if (!target) return res.status(400).json({ error: "target required" });
    const t0 = Date.now();
    const out = await dsm.login(target);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/dsm/login", target, ok: true, durMs: Date.now()-t0 }, { dir: cfg.audit.dir });
    res.json({ ok: true, sid: out.sid });
  } catch (e) {
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/dsm/login", ok: false, error: e.message }, { dir: cfg.audit.dir });
    res.status(400).json({ error: e.message });
  }
});

app.post("/dsm/logout", async (req, res) => {
  try {
    const { target } = req.body || {};
    if (!target) return res.status(400).json({ error: "target required" });
    const t0 = Date.now();
    const out = await dsm.logout(target);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/dsm/logout", target, ok: true, durMs: Date.now()-t0 }, { dir: cfg.audit.dir });
    res.json(out);
  } catch (e) {
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/dsm/logout", ok: false, error: e.message }, { dir: cfg.audit.dir });
    res.status(400).json({ error: e.message });
  }
});

app.post("/dsm/list", async (req, res) => {
  try {
    const { target, path } = req.body || {};
    if (!target || !path) return res.status(400).json({ error: "target and path required" });
    const t0 = Date.now();
    const out = await dsm.fsList(target, path);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/dsm/list", target, ok: true, durMs: Date.now()-t0, path }, { dir: cfg.audit.dir });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/dsm/mkdir", async (req, res) => {
  try {
    const { target, path, name } = req.body || {};
    if (!target || !path || !name) return res.status(400).json({ error: "target, path, name required" });
    const t0 = Date.now();
    const out = await dsm.fsMkdir(target, path, name);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/dsm/mkdir", target, ok: true, durMs: Date.now()-t0, path, name }, { dir: cfg.audit.dir });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/dsm/move", async (req, res) => {
  try {
    const { target, paths, dest, overwrite = false } = req.body || {};
    if (!target || !paths || !dest) return res.status(400).json({ error: "target, paths, dest required" });
    const t0 = Date.now();
    const out = await dsm.fsMove(target, paths, dest, !!overwrite);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/dsm/move", target, ok: true, durMs: Date.now()-t0, dest }, { dir: cfg.audit.dir });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/dsm/delete", async (req, res) => {
  try {
    const { target, paths, recursive = false } = req.body || {};
    if (!target || !paths) return res.status(400).json({ error: "target and paths required" });
    const t0 = Date.now();
    const out = await dsm.fsDelete(target, paths, !!recursive);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/dsm/delete", target, ok: true, durMs: Date.now()-t0, recursive: !!recursive }, { dir: cfg.audit.dir });
    res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin helpers
app.post("/admin/storage-summary", async (req, res) => {
  try {
    const { target } = req.body || {};
    if (!target) return res.status(400).json({ error: "target required" });
    const t = resolveTarget(target);
    const t0 = Date.now();
    const df = await runSshCommand(t, cfg.sshKeyPath, "df -h");
    const md = await runSshCommand(t, cfg.sshKeyPath, "cat /proc/mdstat");
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/admin/storage-summary", target, ok: true, durMs: Date.now()-t0 }, { dir: cfg.audit.dir });
    res.json({ df, mdstat: md });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/admin/docker-list", async (req, res) => {
  try {
    const { target } = req.body || {};
    if (!target) return res.status(400).json({ error: "target required" });
    const t = resolveTarget(target);
    const t0 = Date.now();
    const out = await runSshCommand(t, cfg.sshKeyPath, "docker ps --format '{{json .}}'");
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/admin/docker-list", target, ok: true, durMs: Date.now()-t0 }, { dir: cfg.audit.dir });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/admin/log-tail", async (req, res) => {
  try {
    const { target, path: logPath, lines = 200 } = req.body || {};
    if (!target || !logPath) return res.status(400).json({ error: "target and path required" });
    const allow = (cfg.admin.logAllowPrefixes || []);
    const ok = allow.some((p) => String(logPath).startsWith(p));
    if (!ok) return res.status(403).json({ error: "path not allowed" });
    const t = resolveTarget(target);
    const t0 = Date.now();
    const cmd = `tail -n ${Math.max(1, Math.min(2000, Number(lines) || 200))} -- "${String(logPath).replaceAll('"','\\"')}"`;
    const out = await runSshCommand(t, cfg.sshKeyPath, cmd);
    if (cfg.audit.enabled) await appendAudit({ kind: "http", route: "/admin/log-tail", target, ok: true, durMs: Date.now()-t0, path: logPath, lines: Number(lines) || 200 }, { dir: cfg.audit.dir });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Local filesystem endpoints (safe, baseDir-scoped)
app.post("/local/read", async (req, res) => {
  try {
    const { localPath } = req.body || {};
    if (!localPath) return res.status(400).json({ error: "localPath required" });
    const abs = resolveLocalPath(String(localPath));
    const data = fs.readFileSync(abs);
    let contentUtf8;
    try { contentUtf8 = data.toString("utf8"); } catch {}
    if (contentUtf8 && /^[\s\S]*$/.test(contentUtf8)) return res.json({ content: contentUtf8, encoding: "utf8", path: abs });
    return res.json({ content: data.toString("base64"), encoding: "base64", path: abs });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

app.post("/local/write", async (req, res) => {
  try {
    const { localPath, content, encoding } = req.body || {};
    if (!localPath || typeof content !== "string") return res.status(400).json({ error: "localPath and content required" });
    const abs = resolveLocalPath(String(localPath));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const buf = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
    fs.writeFileSync(abs, buf);
    return res.json({ ok: true, bytes: buf.length, path: abs });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

app.post("/local/delete", async (req, res) => {
  try {
    const { localPath } = req.body || {};
    if (!localPath) return res.status(400).json({ error: "localPath required" });
    const abs = resolveLocalPath(String(localPath));
    fs.unlinkSync(abs);
    return res.json({ ok: true, path: abs });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

export function startServer() {
  const port = process.env.PORT ? Number(process.env.PORT) : 8765;
  if (cfg.tls.enabled) {
    const key = fs.readFileSync(cfg.tls.keyPath);
    const cert = fs.readFileSync(cfg.tls.certPath);
    const options = {
      key,
      cert,
      ca: cfg.tls.caPath ? fs.readFileSync(cfg.tls.caPath) : undefined,
      requestCert: cfg.tls.requestClientCert,
      rejectUnauthorized: cfg.tls.rejectUnauthorized,
    };
    const server = https.createServer(options, app);
    server.listen(port, () => console.log(`HTTPS listening on :${port}`));
  } else {
    const server = http.createServer(app);
    server.listen(port, () => console.log(`HTTP listening on :${port}`));
  }
}
