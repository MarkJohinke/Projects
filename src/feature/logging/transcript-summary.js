"use strict";

function wordFreq(entries, { topN = 10 } = {}) {
  const freq = new Map();
  const stop = new Set([
    "the","and","for","with","that","this","from","have","were","was","are","you","your","into","about","then","them","they","will","just","like","been","what","when","where","how","why","all","any","but","can","could","should","would","there","here","over","under","into","onto","off","also","not","none","null","true","false","set","get","use","used","using","run","node","src","index","path","list","log","read","append","today","now"
  ]);
  for (const e of entries) {
    const text = String(e.text || "").toLowerCase();
    for (const raw of text.split(/[^a-z0-9]+/g)) {
      const w = raw.trim();
      if (!w) continue;
      if (w.length < 4) continue;
      if (stop.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  const arr = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
  return arr.slice(0, topN).map(([word, count]) => ({ word, count }));
}

function listTags(entries) {
  const counts = new Map();
  for (const e of entries) {
    const tag = e?.meta?.tag;
    if (!tag) continue;
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
}

function groupByDate(entries) {
  const by = {};
  for (const e of entries) {
    const d = new Date(e.ts);
    if (isNaN(d)) continue;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const key = `${yyyy}-${mm}-${dd}`;
    by[key] = (by[key] || 0) + 1;
  }
  return by;
}

function summarizeEntries(entries, { sampleLast = 5, topWords = 8 } = {}) {
  const total = entries.length;
  const byRole = {};
  let firstTs = null;
  let lastTs = null;
  for (const e of entries) {
    const role = e.role || "unknown";
    byRole[role] = (byRole[role] || 0) + 1;
    if (!firstTs || e.ts < firstTs) firstTs = e.ts;
    if (!lastTs || e.ts > lastTs) lastTs = e.ts;
  }
  const keywords = wordFreq(entries, { topN: topWords });
  const tags = listTags(entries);
  const lastItems = entries.slice(-sampleLast).map((e) => ({ ts: e.ts, role: e.role, text: e.text, meta: e.meta }));
  const byDate = groupByDate(entries);
  return {
    total,
    byRole,
    firstTs,
    lastTs,
    days: Object.keys(byDate).length,
    byDate,
    keywords,
    tags,
    lastItems,
  };
}

module.exports = {
  summarizeEntries,
  groupByDate,
};
 
