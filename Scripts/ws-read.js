#!/usr/bin/env node
import WebSocket from "ws";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[k] = v;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url || process.env.WS_URL || "ws://localhost:8766";
  const target = args.target || args.t;
  const remotePath = args.path || args.remotePath || args.p;
  const token = args.token || process.env.API_TOKEN || "";
  if (!target || !remotePath) {
    console.error("Usage: node scripts/ws-read.js --target <dev|personal|yoga> --path <remotePath> [--url ws://host:8766] [--token <token>]");
    process.exit(2);
  }

  const ws = new WebSocket(url, { rejectUnauthorized: false });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  function send(msg) {
    return new Promise((resolve, reject) => {
      ws.once("message", (data) => {
        try { resolve(JSON.parse(data.toString())); }
        catch (e) { resolve({ error: "invalid json", raw: data.toString() }); }
      });
      ws.once("error", reject);
      ws.send(JSON.stringify(msg));
    });
  }

  if (token) {
    await send({ id: 0, auth: { token } });
  }
  const resp = await send({ id: 1, method: "nas.read", params: { target, remotePath } });
  console.log(JSON.stringify(resp, null, 2));
  ws.close();
}

main().catch((e) => { console.error("WS error:", e.message); process.exit(1); });

