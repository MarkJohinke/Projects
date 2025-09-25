"use strict";

const os = require("os");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { spawn } = require("child_process");

function execCmd(cmd, args, opts = {}) {
  const { dryRun = false, cwd, env } = opts;
  if (dryRun) {
    return Promise.resolve({
      code: 0,
      stdout: `DRY_RUN: ${cmd} ${args.join(" ")}`,
      stderr: "",
    });
  }
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve({ code, stdout, stderr });
      else reject(Object.assign(new Error(stderr || stdout || `Command failed: ${cmd}`), { code, stdout, stderr }));
    });
  });
}

function percentEncode(str) {
  return encodeURIComponent(str);
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function buildWinConnectArgs(opts) {
  const { host, share, username, password, domain, driveLetter, persistent = true } = opts;
  const unc = `\\\\${host}\\${share}`;
  const args = ["use"]; // net use ...
  if (driveLetter) args.push(`${driveLetter}:`);
  args.push(unc);
  // net use expects password as separate token; empty quotes means prompt; we pass it directly
  if (password) args.push(password);
  const userVal = domain ? `${domain}\\${username}` : username;
  if (username) {
    args.push("/user:" + userVal);
  }
  args.push(persistent ? "/persistent:yes" : "/persistent:no");
  return { cmd: "net", args };
}

function buildMacConnectArgs(opts) {
  const { host, share, username, password, mountPath } = opts;
  const smbUrl = `smb://${percentEncode(username)}:${percentEncode(password)}@${host}/${share}`;
  return { cmd: "mount_smbfs", args: [smbUrl, mountPath] };
}

function buildLinuxConnectArgs(opts, credentialsPath) {
  const { host, share, mountPath } = opts;
  const src = `//${host}/${share}`;
  const options = [
    `credentials=${credentialsPath}`,
    "iocharset=utf8",
    "file_mode=0770",
    "dir_mode=0770",
    // Avoid client-side permission checks so server ACLs prevail
    "noperm",
  ].join(",");
  return { cmd: "mount", args: ["-t", "cifs", src, mountPath, "-o", options] };
}

function buildDisconnect(platform, opts) {
  if (platform === "win32") {
    const { driveLetter, host, share } = opts;
    const args = ["use"]; // net use
    if (driveLetter) args.push(`${driveLetter}:`);
    else if (host && share) args.push(`\\\\${host}\\${share}`);
    else throw new Error("On Windows, provide --drive-letter or --host and --share to disconnect.");
    args.push("/delete", "/y");
    return { cmd: "net", args };
  }
  // macOS / Linux
  const { mountPath } = opts;
  if (!mountPath) throw new Error("Provide --mount-path for disconnect on macOS/Linux.");
  return { cmd: "umount", args: [mountPath] };
}

function buildStatus(platform) {
  if (platform === "win32") return { cmd: "net", args: ["use"] };
  return { cmd: "mount", args: [] };
}

async function connect(opts = {}) {
  const platform = process.platform;
  const dryRun = Boolean(process.env.DRY_RUN);
  const { host, share, username, password } = opts;
  if (!host || !share) throw new Error("Missing required options: --host and --share");
  if (platform === "win32") {
    if (!username || !password) throw new Error("Windows connect requires --username and --password");
    const { cmd, args } = buildWinConnectArgs(opts);
    return execCmd(cmd, args, { dryRun });
  }
  if (platform === "darwin") {
    const { mountPath } = opts;
    if (!mountPath) throw new Error("Provide --mount-path for macOS.");
    if (!username || !password) throw new Error("macOS connect requires --username and --password");
    await ensureDir(mountPath);
    const { cmd, args } = buildMacConnectArgs(opts);
    return execCmd(cmd, args, { dryRun });
  }
  // linux
  const { mountPath, domain } = opts;
  if (!mountPath) throw new Error("Provide --mount-path for Linux.");
  if (!username || !password) throw new Error("Linux connect requires --username and --password");
  await ensureDir(mountPath);
  const credFile = path.join(os.tmpdir(), `nas-cred-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const lines = [
    `username=${username}`,
    `password=${password}`,
  ];
  if (domain) lines.push(`domain=${domain}`);
  await fsp.writeFile(credFile, lines.join(os.EOL), { mode: 0o600 });
  try {
    const { cmd, args } = buildLinuxConnectArgs(opts, credFile);
    return await execCmd(cmd, args, { dryRun });
  } finally {
    try { await fsp.rm(credFile, { force: true }); } catch { /* noop */ }
  }
}

async function disconnect(opts = {}) {
  const platform = process.platform;
  const dryRun = Boolean(process.env.DRY_RUN);
  const { cmd, args } = buildDisconnect(platform, opts);
  return execCmd(cmd, args, { dryRun });
}

async function status(opts = {}) {
  const platform = process.platform;
  const dryRun = Boolean(process.env.DRY_RUN);
  const { cmd, args } = buildStatus(platform);
  const res = await execCmd(cmd, args, { dryRun });
  return res;
}

async function listDir(targetPath) {
  if (!targetPath) throw new Error("Provide --path for list");
  const entries = await fsp.readdir(targetPath, { withFileTypes: true });
  return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }));
}

module.exports = {
  connect,
  disconnect,
  status,
  listDir,
  // export builders for testing
  _build: {
    buildWinConnectArgs,
    buildMacConnectArgs,
    buildLinuxConnectArgs,
    buildDisconnect,
    buildStatus,
  },
};

