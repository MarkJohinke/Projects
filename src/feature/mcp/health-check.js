"use strict";

async function httpJson(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

async function checkMcp(baseUrl) {
  const base = baseUrl.replace(/\/$/, "");
  const health = await httpJson("GET", `${base}/.well-known/mcp/health`);
  const tools = await httpJson("POST", `${base}/mcp/tools`, {});
  const summary = {
    baseUrl: base,
    health: { ok: !!(health.json && (health.json.ok === true || health.ok)), status: health.status },
    tools: { count: Array.isArray(tools.json?.tools) ? tools.json.tools.length : 0, status: tools.status },
    sampleTools: Array.isArray(tools.json?.tools) ? tools.json.tools.slice(0, 5).map(t => t.name) : [],
  };
  return summary;
}

module.exports = { checkMcp };

