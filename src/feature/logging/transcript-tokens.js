"use strict";

function estimateTokens(text, mode = "chars4") {
  const s = String(text || "");
  if (!s) return 0;
  if (mode === "words") {
    const m = s.match(/\S+/g);
    return m ? m.length : 0;
  }
  // default: chars/4 approximation
  const charCount = [...s].length; // rough, includes punctuation
  return Math.ceil(charCount / 4);
}

function summarizeTokens(entries, { mode = "chars4", includeMetaText = false } = {}) {
  let total = 0;
  const byRole = {};
  const byDate = {};
  for (const e of entries) {
    let t = estimateTokens(e.text, mode);
    if (includeMetaText && e && e.meta && typeof e.meta.text === "string") {
      t += estimateTokens(e.meta.text, mode);
    }
    total += t;
    const role = e.role || "unknown";
    byRole[role] = (byRole[role] || 0) + t;
    const d = new Date(e.ts);
    if (!isNaN(d)) {
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;
      byDate[key] = (byDate[key] || 0) + t;
    }
  }
  const avg = entries.length ? total / entries.length : 0;
  return { totalTokens: total, avgTokensPerEntry: avg, entries: entries.length, byRole, byDate, mode };
}

module.exports = {
  estimateTokens,
  summarizeTokens,
};
