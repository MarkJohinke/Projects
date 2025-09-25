#!/usr/bin/env node
// Tail audit logs cross-platform without extra deps
import fs from "fs";
import path from "path";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[key] = true; else { out[key] = next; i++; }
    }
  }
  return out;
}

function defaultAuditDir() {
  return path.resolve(process.env.AUDIT_DIR || path.join(process.cwd(), "codex", "audit"));
}

function findLatestFile(dir) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const jsonl = files.filter((f) => f.endsWith(".jsonl")).sort();
  if (jsonl.length === 0) return null;
  return path.join(dir, jsonl[jsonl.length - 1]);
}

function tailLastLines(file, maxLines) {
  try {
    const data = fs.readFileSync(file, "utf8");
    const lines = data.split(/\r?\n/).filter(Boolean);
    const slice = lines.slice(Math.max(0, lines.length - maxLines));
    slice.forEach((l) => console.log(l));
  } catch (e) {
    console.error("Failed to read file:", e.message);
  }
}

function followFile(file, startAtEnd = true) {
  let lastSize = 0;
  try {
    const st = fs.statSync(file);
    lastSize = startAtEnd ? st.size : 0;
  } catch {}
  fs.watchFile(file, { interval: 500 }, (curr, prev) => {
    if (!curr || curr.size < lastSize) {
      lastSize = 0; // rotated/truncated
      return;
    }
    const from = lastSize;
    const to = curr.size;
    if (to > from) {
      const stream = fs.createReadStream(file, { start: from, end: to - 1, encoding: "utf8" });
      stream.on("data", (chunk) => process.stdout.write(chunk));
      lastSize = to;
    }
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const dir = path.resolve(args.dir || defaultAuditDir());
  const file = args.file ? path.resolve(args.file) : findLatestFile(dir);
  const lines = Number(args.lines || 50);
  const follow = !!args.follow;

  if (!file) {
    console.error("No audit file found. Directory:", dir);
    process.exit(1);
  }
  console.error("Audit file:", file);
  tailLastLines(file, lines);
  if (follow) {
    followFile(file, true);
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});

