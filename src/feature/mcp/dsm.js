import http from "http";
import https from "https";
import { getConfig } from "./config.js";

const cfg = getConfig();

const sessions = {
  dev: null,
  personal: null,
};

function targetCfg(name) {
  if (name === "dev") return cfg.dev;
  if (name === "personal") return cfg.personal;
  throw new Error("unknown target");
}

function makeClient(url) {
  const u = new URL(url);
  const isHttps = u.protocol === "https:";
  const agent = isHttps
    ? new https.Agent({ rejectUnauthorized: !cfg.dsm.skipTlsVerify })
    : new http.Agent();
  return { base: u, isHttps, agent };
}

function doRequest(client, path, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      // FileStation supports comma-separated lists for many fields
      qs.append(k, v.join(","));
    } else {
      qs.append(k, String(v));
    }
  });
  const url = new URL(path, client.base);
  url.search = qs.toString();
  const transport = client.isHttps ? https : http;
  const opts = {
    method: "GET",
    hostname: url.hostname,
    port: url.port || (client.isHttps ? 443 : 80),
    path: url.pathname + (url.search ? `?${url.search}` : ""),
    agent: client.agent,
  };
  return new Promise((resolve, reject) => {
    const req = transport.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const txt = Buffer.concat(chunks).toString("utf8");
        try {
          resolve(JSON.parse(txt));
        } catch (e) {
          reject(new Error(`DSM invalid JSON: ${e.message}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function login(name) {
  const t = targetCfg(name);
  if (!t?.dsm?.baseUrl) throw new Error("DSM baseUrl not configured");
  if (!t?.dsm?.user || !t?.dsm?.pass) throw new Error("DSM credentials missing");
  const client = makeClient(t.dsm.baseUrl);
  const res = await doRequest(client, "/webapi/auth.cgi", {
    api: "SYNO.API.Auth",
    method: "login",
    version: 6,
    account: t.dsm.user,
    passwd: t.dsm.pass,
    session: "FileStation",
    format: "sid",
  });
  if (!res?.success || !res?.data?.sid) {
    throw new Error(`DSM login failed: ${JSON.stringify(res)}`);
  }
  const sess = { sid: res.data.sid, client };
  sessions[name] = sess;
  return sess;
}

async function ensureSession(name) {
  return sessions[name] || (await login(name));
}

async function logout(name) {
  const sess = sessions[name];
  if (!sess) return { ok: true };
  const out = await doRequest(sess.client, "/webapi/auth.cgi", {
    api: "SYNO.API.Auth",
    method: "logout",
    version: 6,
    session: "FileStation",
    _sid: sess.sid,
  });
  sessions[name] = null;
  return out;
}

async function fsList(name, folderPath) {
  const sess = await ensureSession(name);
  const res = await doRequest(sess.client, "/webapi/entry.cgi", {
    api: "SYNO.FileStation.List",
    method: "list",
    version: 2,
    folder_path: folderPath,
    _sid: sess.sid,
  });
  return res;
}

async function fsMkdir(name, folderPath, newName) {
  const sess = await ensureSession(name);
  const res = await doRequest(sess.client, "/webapi/entry.cgi", {
    api: "SYNO.FileStation.CreateFolder",
    method: "create",
    version: 2,
    folder_path: folderPath,
    name: newName,
    _sid: sess.sid,
  });
  return res;
}

async function fsMove(name, paths, dest, overwrite = false) {
  const sess = await ensureSession(name);
  const res = await doRequest(sess.client, "/webapi/entry.cgi", {
    api: "SYNO.FileStation.CopyMove",
    method: "move",
    version: 3,
    path: Array.isArray(paths) ? paths.join(",") : String(paths),
    dest_folder_path: dest,
    overwrite: overwrite ? "true" : "false",
    _sid: sess.sid,
  });
  return res;
}

async function fsDelete(name, paths, recursive = false) {
  const sess = await ensureSession(name);
  const res = await doRequest(sess.client, "/webapi/entry.cgi", {
    api: "SYNO.FileStation.Delete",
    method: "delete",
    version: 2,
    path: Array.isArray(paths) ? paths.join(",") : String(paths),
    recursive: recursive ? "true" : "false",
    _sid: sess.sid,
  });
  return res;
}

export const dsm = {
  login,
  logout,
  fsList,
  fsMkdir,
  fsMove,
  fsDelete,
};

