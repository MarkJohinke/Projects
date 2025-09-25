import fs from "fs";
import { Client } from "ssh2";
import { getConfig } from "./config.js";

function connectSsh(target, sshKeyPath) {
  const cfg = getConfig();
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let authOpts = {};
    try {
      const privateKey = fs.readFileSync(sshKeyPath, "utf8");
      authOpts = { privateKey };
    } catch (e) {
      if (cfg.sshPasswordEnabled && cfg.sshPassword) {
        authOpts = { password: cfg.sshPassword };
      } else {
        return reject(e);
      }
    }
    conn
      .on("ready", () => resolve(conn))
      .on("error", (e) => reject(e))
      .connect({
        host: target.host,
        port: target.port,
        username: target.user,
        readyTimeout: 10000,
        ...authOpts,
      });
  });
}

export async function sftpReadFile(target, sshKeyPath, remotePath) {
  const conn = await connectSsh(target, sshKeyPath);
  try {
    const sftp = await new Promise((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))));
    return await new Promise((resolve, reject) => {
      sftp.readFile(remotePath, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  } finally {
    conn.end();
  }
}

export async function sftpWriteFile(target, sshKeyPath, remotePath, buffer) {
  const conn = await connectSsh(target, sshKeyPath);
  try {
    const sftp = await new Promise((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))));
    await new Promise((resolve, reject) => {
      sftp.fastPut(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer), remotePath, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  } finally {
    conn.end();
  }
}

export async function sftpListDir(target, sshKeyPath, dirPath) {
  const conn = await connectSsh(target, sshKeyPath);
  try {
    const sftp = await new Promise((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))));
    return await new Promise((resolve, reject) => {
      sftp.readdir(dirPath, (err, list) => {
        if (err) return reject(err);
        const items = list.map((e) => ({
          name: e.filename,
          longname: e.longname,
          attrs: {
            size: e.attrs?.size,
            mtime: e.attrs?.mtime,
            mode: e.attrs?.mode,
            uid: e.attrs?.uid,
            gid: e.attrs?.gid,
          },
        }));
        resolve(items);
      });
    });
  } finally {
    conn.end();
  }
}

export async function sftpDeleteFile(target, sshKeyPath, remotePath) {
  const conn = await connectSsh(target, sshKeyPath);
  try {
    const sftp = await new Promise((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))));
    await new Promise((resolve, reject) => {
      sftp.unlink(remotePath, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  } finally {
    conn.end();
  }
}
