"use strict";

import fs from "fs";
import path from "path";
const fsp = fs.promises;

function pad2(n) { return String(n).padStart(2, "0"); }
function yyyy_mm_dd(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); }

export async function appendAudit(event, opts = {}) {
  const dir = path.resolve(opts.dir || process.env.AUDIT_DIR || path.join(process.cwd(), "codex", "audit"));
  await ensureDir(dir);
  const file = path.join(dir, `${yyyy_mm_dd(new Date())}.jsonl`);
  const payload = Object.assign({ ts: new Date().toISOString() }, event);
  const line = JSON.stringify(payload) + "\n";
  await fsp.appendFile(file, line, { encoding: "utf8" });
  return file;
}

