import fs from "fs";
import { Client } from "ssh2";
import { getConfig } from "./config.js";

export function runSshCommand(target, sshKeyPath, command) {
  const cfg = getConfig();
  function connectWith(authOpts) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      conn
        .on("ready", () => resolve(conn))
        .on("error", reject)
        .connect({
          host: target.host,
          port: target.port,
          username: target.user,
          readyTimeout: 10000,
          ...authOpts,
        });
    });
  }
  async function getConnection() {
    // Try key auth first if provided
    if (sshKeyPath) {
      try {
        const privateKey = fs.readFileSync(sshKeyPath, "utf8");
        return await connectWith({ privateKey });
      } catch (e) {
        // fall through to password if enabled
      }
    }
    if (cfg.sshPasswordEnabled && cfg.sshPassword) {
      return await connectWith({ password: cfg.sshPassword });
    }
    // If we got here, throw last error
    throw new Error("SSH auth not configured: provide SSH_KEY_PATH or enable SSH_PASSWORD");
  }
  return new Promise(async (resolve, reject) => {
    let conn;
    try {
      try {
        // primary attempt (key)
        const privateKey = fs.readFileSync(sshKeyPath, "utf8");
        conn = await connectWith({ privateKey });
      } catch (e1) {
        if (cfg.sshPasswordEnabled && cfg.sshPassword) {
          try {
            conn = await connectWith({ password: cfg.sshPassword });
          } catch (e2) {
            return reject(e2);
          }
        } else {
          return reject(e1);
        }
      }
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        let stdout = "";
        let stderr = "";
        stream
          .on("close", (code) => {
            conn.end();
            resolve({ code, stdout, stderr });
          })
          .on("data", (data) => (stdout += data))
          .stderr.on("data", (data) => (stderr += data));
      });
    } catch (e) {
      if (conn) try { conn.end(); } catch {}
      reject(e);
    }
  });
}
