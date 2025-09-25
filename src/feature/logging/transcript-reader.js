"use strict";

import fs from "fs";
import path from "path";
import readline from "readline";
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

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function resolveDir(customDir) {
  const base = customDir || process.env.CODEX_TRANSCRIPTS_DIR || path.join(process.cwd(), "codex", "transcripts");
  return path.resolve(base);
}

async function listFiles(dir, { all = false, date, dateFrom, dateTo, days } = {}) {
  const abs = resolveDir(dir);
  try {
    await fsp.access(abs, fs.constants.R_OK);
  } catch {
    return [];
  }
  let targetDates = [];
  if (!all) {
    if (date) {
      targetDates = [date];
    } else if (dateFrom || dateTo || days) {
      let start;
      let end;
      const today = new Date();
      const todayFloor = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
      if (typeof days === "number" && days > 0) {
        end = todayFloor;
        start = addDays(end, -(days - 1));
      } else {
        end = dateTo ? new Date(`${dateTo}T00:00:00Z`) : todayFloor;
        start = dateFrom ? new Date(`${dateFrom}T00:00:00Z`) : end;
      }
      const cursor = new Date(start.getTime());
      while (cursor <= end) {
        targetDates.push(formatDate(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
  }

  if (targetDates.length > 0) {
    return targetDates.map((d) => path.join(abs, `${d}.jsonl`));
  }

  const files = await fsp.readdir(abs);
  return files
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .map((f) => path.join(abs, f));
}

function matchEntry(entry, { role, contains }) {
  if (role && String(entry.role || "").toLowerCase() !== String(role).toLowerCase()) return false;
  if (contains) {
    const needle = String(contains).toLowerCase();
    const hay = String(entry.text || "").toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

async function* iterEntries(files) {
  for (const file of files) {
    try {
      await fsp.access(file, fs.constants.R_OK);
    } catch {
      continue;
    }
    const stream = fs.createReadStream(file, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        yield obj;
      } catch {
        // skip malformed lines
      }
    }
  }
}

async function readTranscripts({ dir, all = false, date, dateFrom, dateTo, days, role, contains, limit, since } = {}) {
  const files = await listFiles(dir, { all, date, dateFrom, dateTo, days });
  const out = [];
  const sinceTs = since ? Date.parse(since) : undefined;
  for await (const entry of iterEntries(files)) {
    if (sinceTs && Date.parse(entry.ts) < sinceTs) continue;
    if (matchEntry(entry, { role, contains })) {
      out.push(entry);
      if (limit && out.length >= Number(limit)) break;
    }
  }
  return out;
}

export { resolveDir, listFiles, readTranscripts };
