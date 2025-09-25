import { WebSocketServer } from "ws";
import fs from "fs";
import http from "http";
import https from "https";
import { getConfig } from "./config.js";
import { runSshCommand } from "./ssh.js";
import { sftpReadFile, sftpWriteFile, sftpListDir } from "./sftp.js";
import { appendAudit } from "../logging/audit-logger.js";
import { isCommandAllowed, commandProgram } from "./exec-policy.js";

const cfg = getConfig();

function resolveTarget(name) {
  if (name === "dev") return cfg.dev;
  if (name === "personal") return cfg.personal;
  if (name === "yoga" && cfg.yoga?.host) return cfg.yoga;
  throw new Error("unknown target");
}

// Minimal MCP-like protocol over WebSocket
// Messages: { id, method, params }
// Responses: { id, result } or { id, error }

async function handle(method, params) {
  switch (method) {
    case "nas.exec": {
      const { target, command } = params || {};
      if (!target || !command) throw new Error("target and command required");
      if (!isCommandAllowed(command, cfg)) {
        throw new Error(`command not allowed: ${commandProgram(command)}`);
      }
      const t = resolveTarget(target);
      return await runSshCommand(t, cfg.sshKeyPath, command);
    }
    case "nas.read": {
      const { target, remotePath } = params || {};
      if (!target || !remotePath) throw new Error("target and remotePath required");
      const t = resolveTarget(target);
      try {
        const data = await sftpReadFile(t, cfg.sshKeyPath, remotePath);
        return { content: data.toString("base64"), encoding: "base64", via: "sftp" };
      } catch (e) {
        // Fallback to SSH cat for paths outside SFTP chroot (e.g., /proc/*)
        const esc = String(remotePath).replaceAll('"','\\"');
        const out = await runSshCommand(t, cfg.sshKeyPath, `cat -- "${esc}"`);
        if (out.code === 0) {
          return { content: out.stdout || "", encoding: "utf8", via: "ssh-cat" };
        }
        throw new Error(out.stderr || `read failed (code=${out.code})`);
      }
    }
    case "nas.write": {
      const { target, remotePath, content, encoding } = params || {};
      if (!target || !remotePath || typeof content !== "string") throw new Error("target, remotePath, content required");
      const t = resolveTarget(target);
      const buf = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
      await sftpWriteFile(t, cfg.sshKeyPath, remotePath, buf);
      return { ok: true };
    }
    case "nas.checkRaid": {
      const { target } = params || {};
      if (!target) throw new Error("target required");
      const t = resolveTarget(target);
      const cmd = "cat /proc/mdstat";
      const out = await runSshCommand(t, cfg.sshKeyPath, cmd);
      return out;
    }
    case "nas.listDir": {
      const { target, dir } = params || {};
      if (!target || !dir) throw new Error("target and dir required");
      const t = resolveTarget(target);
      const items = await sftpListDir(t, cfg.sshKeyPath, dir);
      return { items };
    }
    case "house.scan": {
      const { target, dir, minSizeMB = 250, olderThanDays = 365 } = params || {};
      if (!target || !dir) throw new Error("target and dir required");
      const t = resolveTarget(target);
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
      return { items: matches };
    }
    case "house.dupes": {
      const { target, dir } = params || {};
      if (!target || !dir) throw new Error("target and dir required");
      const t = resolveTarget(target);
      const items = await sftpListDir(t, cfg.sshKeyPath, dir);
      const files = (items || []).filter((e) => e.attrs?.size >= 0);
      const map = new Map();
      for (const f of files) {
        const key = `${f.name}|${f.attrs?.size ?? 0}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ name: f.name, size: f.attrs?.size, mtime: f.attrs?.mtime });
      }
      const groups = [...map.values()].filter((g) => g.length > 1);
      return { groups };
    }
    case "admin.storageSummary": {
      const { target } = params || {};
      if (!target) throw new Error("target required");
      const t = resolveTarget(target);
      const df = await runSshCommand(t, cfg.sshKeyPath, "df -h");
      const md = await runSshCommand(t, cfg.sshKeyPath, "cat /proc/mdstat");
      return { df, mdstat: md };
    }
    case "admin.dockerList": {
      const { target } = params || {};
      if (!target) throw new Error("target required");
      const t = resolveTarget(target);
      const out = await runSshCommand(t, cfg.sshKeyPath, "docker ps --format '{{json .}}'");
      return out;
    }
    case "admin.logTail": {
      const { target, path: logPath, lines = 200 } = params || {};
      if (!target || !logPath) throw new Error("target and path required");
      const allow = (cfg.admin?.logAllowPrefixes || []);
      const ok = allow.some((p) => String(logPath).startsWith(p));
      if (!ok) throw new Error("path not allowed");
      const t = resolveTarget(target);
      const n = Math.max(1, Math.min(2000, Number(lines) || 200));
      const cmd = `tail -n ${n} -- "${String(logPath).replaceAll('"','\\"')}"`;
      const out = await runSshCommand(t, cfg.sshKeyPath, cmd);
      return out;
    }
    case "nas.move": {
      const { target, from, to } = params || {};
      if (!target || !from || !to) throw new Error("target, from, to required");
      const t = resolveTarget(target);
      const cmd = `mv -- "${from.replaceAll('"','\\"')}" "${to.replaceAll('"','\\"')}"`;
      const out = await runSshCommand(t, cfg.sshKeyPath, cmd);
      if (out.code !== 0) return out;
      return { ok: true };
    }
    case "nas.delete": {
      const { target, path, recursive } = params || {};
      if (!target || !path) throw new Error("target and path required");
      const t = resolveTarget(target);
      const flag = recursive ? "-r" : "";
      const cmd = `rm ${flag} -- "${path.replaceAll('"','\\"')}"`;
      const out = await runSshCommand(t, cfg.sshKeyPath, cmd);
      if (out.code !== 0) return out;
      return { ok: true };
    }
    case "tools.list": {
      return [
        { name: "nas.exec", params: ["target","command"] },
        { name: "nas.read", params: ["target","remotePath"] },
        { name: "nas.write", params: ["target","remotePath","content"] },
        { name: "nas.checkRaid", params: ["target"] },
        { name: "nas.listDir", params: ["target","dir"] },
        { name: "nas.move", params: ["target","from","to"] },
        { name: "nas.delete", params: ["target","path","recursive?"] },
        { name: "house.scan", params: ["target","dir","minSizeMB?","olderThanDays?"] },
        { name: "house.dupes", params: ["target","dir"] },
      ];
    }
    default:
      throw new Error(`unknown method: ${method}`);
  }
}

export function startMcpWs() {
  const port = process.env.MCP_PORT ? Number(process.env.MCP_PORT) : 8766;
  let server;
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
    server = https.createServer(options);
    server.listen(port, () => console.log(`WSS listening on :${port}`));
  } else {
    server = http.createServer();
    server.listen(port, () => console.log(`WS listening on :${port}`));
  }
  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    // Optional token on initial message: { auth: { token } }
    let authed = !cfg.apiToken;
    ws.on("message", async (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch (e) {
        return ws.send(JSON.stringify({ error: "invalid json" }));
      }
      const { id, method, params, auth } = msg || {};
      if (!authed) {
        if (auth && auth.token === cfg.apiToken) authed = true;
        if (!authed) return ws.send(JSON.stringify({ id, error: "unauthorized" }));
      }
      try {
        const t0 = Date.now();
        const result = await handle(method, params);
        if (cfg.audit?.enabled) await appendAudit({ kind: "ws", method, ok: true, durMs: Date.now()-t0, target: params?.target }, { dir: cfg.audit.dir });
        ws.send(JSON.stringify({ id, result }));
      } catch (e) {
        if (cfg.audit?.enabled) await appendAudit({ kind: "ws", method, ok: false, error: e.message, target: params?.target }, { dir: cfg.audit.dir });
        ws.send(JSON.stringify({ id, error: e.message }));
      }
    });
  });
}
