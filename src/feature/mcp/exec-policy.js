"use strict";

function firstToken(command) {
  if (typeof command !== "string") return "";
  const m = command.trim().match(/^([A-Za-z0-9_\.\/\-]+)/);
  return m ? m[1] : "";
}

function baseName(p) {
  if (!p) return "";
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

export function commandProgram(command) {
  return baseName(firstToken(command));
}

export function isCommandAllowed(command, cfg) {
  const prog = commandProgram(command);
  const allow = (cfg?.exec?.allowlist || []).map(String);
  const deny = (cfg?.exec?.denylist || []).map(String);

  if (deny.includes(prog)) return false;
  if (allow.length > 0 && !allow.includes(prog)) return false;
  return true;
}

