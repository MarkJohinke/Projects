"use strict";

import fs from "fs";
import path from "path";
const fsp = fs.promises;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function resolveDir(customDir) {
  const base = customDir || process.env.CODEX_TRANSCRIPTS_DIR || path.join(process.cwd(), "codex", "transcripts");
  return path.resolve(base);
}

async function appendTranscript(entry, opts = {}) {
  const dir = resolveDir(opts.dir);
  await ensureDir(dir);
  const date = formatDate(new Date());
  const file = path.join(dir, `${date}.jsonl`);
  const payload = Object.assign(
    {
      ts: new Date().toISOString(),
    },
    entry
  );
  const line = JSON.stringify(payload) + "\n";
  await fsp.appendFile(file, line, { encoding: "utf8" });
  return file;
}

export { appendTranscript, resolveDir, formatDate };
