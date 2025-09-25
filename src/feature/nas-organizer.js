"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

async function* walk(dir, opts = {}) {
  const { followSymlinks = false, includeHidden = false } = opts;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    yield { type: "error", path: dir, error: err.message };
    return;
  }
  for (const e of entries) {
    if (!includeHidden && e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) {
      if (!followSymlinks) continue;
      const st = await fsp.stat(full).catch(() => null);
      if (st && st.isDirectory()) {
        yield { type: "dir", path: full };
        yield* walk(full, opts);
      } else if (st && st.isFile()) {
        yield { type: "file", path: full, size: st.size, mtimeMs: st.mtimeMs }; 
      }
      continue;
    }
    if (e.isDirectory()) {
      yield { type: "dir", path: full };
      yield* walk(full, opts);
    } else if (e.isFile()) {
      const st = await fsp.stat(full).catch(() => null);
      if (st) yield { type: "file", path: full, size: st.size, mtimeMs: st.mtimeMs };
    }
  }
}

function extnameLower(p) {
  const ext = path.extname(p || "");
  return ext ? ext.toLowerCase() : "";
}

function hashStream(stream, algo = "sha1", maxBytes = -1) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algo);
    let read = 0;
    stream.on("data", (chunk) => {
      if (maxBytes >= 0 && read >= maxBytes) return; // ignore further
      const slice = maxBytes >= 0 ? chunk.slice(0, Math.max(0, maxBytes - read)) : chunk;
      read += slice.length;
      h.update(slice);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(h.digest("hex")));
  });
}

async function fileHash(p, opts = {}) {
  const { algo = "sha1", maxBytes = -1 } = opts;
  const s = fs.createReadStream(p);
  try {
    const hex = await hashStream(s, algo, maxBytes);
    return hex;
  } finally {
    // stream will auto-close on end, but ensure cleanup on error
  }
}

async function scanRoots(roots, options = {}) {
  const {
    includeHidden = false,
    largeMb = 250,
    oldDays = 365,
    enableDuplicates = true,
    partialHashBytes = 1024 * 1024, // 1 MB prehash
    fullHashLimit = 50, // cap to 50 candidate groups to fully hash in one run
  } = options;

  const now = Date.now();
  const oldMs = oldDays * 24 * 60 * 60 * 1000;
  const largeBytes = largeMb * 1024 * 1024;

  const summary = {
    scannedRoots: roots,
    files: 0,
    dirs: 0,
    totalBytes: 0,
    byExt: {}, // ext -> { count, bytes }
    largeFiles: [], // { path, size }
    oldFiles: [], // { path, mtimeMs }
    zeroBytes: [], // { path }
    errors: [],
    duplicates: [], // groups: [{ size, files: [{ path, hash }] }]
  };

  // First pass: collect basic stats and group by size for duplicates
  const bySize = new Map(); // size -> [file]

  for (const root of roots) {
    // Normalize Windows-style quotes/spaces
    const norm = root.replace(/^\"|\"$/g, "");
    for await (const entry of walk(norm, { includeHidden })) {
      if (entry.type === "error") {
        summary.errors.push({ path: entry.path, error: entry.error });
        continue;
      }
      if (entry.type === "dir") {
        summary.dirs += 1;
      } else if (entry.type === "file") {
        const { path: p, size, mtimeMs } = entry;
        summary.files += 1;
        summary.totalBytes += size;
        const ext = extnameLower(p);
        const agg = summary.byExt[ext] || { count: 0, bytes: 0 };
        agg.count += 1;
        agg.bytes += size;
        summary.byExt[ext] = agg;
        if (size === 0) summary.zeroBytes.push({ path: p });
        if (size >= largeBytes) summary.largeFiles.push({ path: p, size });
        if (now - mtimeMs >= oldMs) summary.oldFiles.push({ path: p, mtimeMs });
        if (enableDuplicates) {
          const arr = bySize.get(size) || [];
          arr.push(p);
          bySize.set(size, arr);
        }
      }
    }
  }

  // Duplicate detection: candidates by size, then partial hash, then full hash
  if (enableDuplicates) {
    const sizeCandidates = [...bySize.entries()].filter(([size, list]) => size > 0 && list.length > 1);
    // Stage 1: partial hash groups
    const byPartial = new Map(); // `${size}:${partial}` -> paths
    for (const [size, files] of sizeCandidates) {
      for (const file of files) {
        try {
          const ph = await fileHash(file, { maxBytes: partialHashBytes });
          const key = `${size}:${ph}`;
          const arr = byPartial.get(key) || [];
          arr.push(file);
          byPartial.set(key, arr);
        } catch (err) {
          summary.errors.push({ path: file, error: `hash(partial): ${err.message}` });
        }
      }
    }

    // Stage 2: full hash for groups with >1 member, capped to avoid long runs
    const partialGroups = [...byPartial.entries()].filter(([, list]) => list.length > 1);
    let processedGroups = 0;
    for (const [key, files] of partialGroups) {
      if (processedGroups >= fullHashLimit) break;
      processedGroups += 1;
      const [sizeStr] = key.split(":");
      const size = Number(sizeStr);
      const byFull = new Map(); // hash -> paths
      for (const file of files) {
        try {
          const fh = await fileHash(file, { maxBytes: -1 });
          const arr = byFull.get(fh) || [];
          arr.push(file);
          byFull.set(fh, arr);
        } catch (err) {
          summary.errors.push({ path: file, error: `hash(full): ${err.message}` });
        }
      }
      for (const [hash, same] of byFull.entries()) {
        if (same.length > 1) {
          summary.duplicates.push({ size, hash, files: same });
        }
      }
    }
  }

  // Sort outputs for readability
  summary.largeFiles.sort((a, b) => b.size - a.size);
  summary.oldFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);
  summary.duplicates.sort((a, b) => b.size - a.size);

  return summary;
}

function humanBytes(n) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSummaryText(summary, opts = {}) {
  const topN = typeof opts.topN === "number" ? opts.topN : 10;
  const lines = [];
  lines.push(`Roots: ${summary.scannedRoots.join(", ")}`);
  lines.push(`Dirs: ${summary.dirs}  Files: ${summary.files}  Size: ${humanBytes(summary.totalBytes)}`);
  // by ext
  const byExt = Object.entries(summary.byExt)
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, topN)
    .map(([ext, agg]) => `${ext || "(none)"}: ${agg.count} (${humanBytes(agg.bytes)})`);
  if (byExt.length) lines.push(`Top by extension: ${byExt.join(", ")}`);
  // large files
  if (summary.largeFiles.length) {
    const showcase = summary.largeFiles.slice(0, topN).map((f) => `${humanBytes(f.size)}\t${f.path}`);
    lines.push("Largest files:");
    for (const s of showcase) lines.push("  " + s);
  }
  // duplicates
  if (summary.duplicates.length) {
    lines.push(`Duplicate groups: ${summary.duplicates.length}`);
    for (const g of summary.duplicates.slice(0, topN)) {
      lines.push(`  ${humanBytes(g.size)}\t${g.files.length} files\t${g.hash.slice(0, 8)}...`);
    }
  }
  if (summary.errors.length) {
    lines.push(`Errors: ${summary.errors.length}`);
  }
  return lines.join("\n");
}

module.exports = {
  scanRoots,
  formatSummaryText,
};

