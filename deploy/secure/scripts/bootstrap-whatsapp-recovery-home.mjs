#!/usr/bin/env node
/**
 * Build a fresh OpenClaw home for WhatsApp recovery cutover (run on the gateway host).
 *
 * Reads a BASE config (default: /home/node/.openclaw/openclaw.json.bak inside the container)
 * and writes RECOVERY_ROOT/openclaw.json with WhatsApp + session invariants.
 *
 * Usage (inside openclaw container or any Node 20+):
 *   node bootstrap-whatsapp-recovery-home.mjs
 *
 * Env:
 *   OPENCLAW_RECOVERY_BASE_CONFIG  - path to JSON to start from (default below)
 *   OPENCLAW_RECOVERY_ROOT         - output home root (default /home/node/.openclaw-recovery)
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const recoveryRoot = process.env.OPENCLAW_RECOVERY_ROOT ?? "/home/node/.openclaw-recovery";
const basePath =
  process.env.OPENCLAW_RECOVERY_BASE_CONFIG ?? "/home/node/.openclaw/openclaw.json.bak";

function toE164String(entry) {
  if (typeof entry === "string") {
    return entry.trim();
  }
  if (typeof entry === "number") {
    const s = String(entry);
    if (s.length === 10) {
      return `+1${s}`;
    }
    return s.startsWith("+") ? s : `+${s}`;
  }
  return String(entry);
}

function normalizeStringList(list) {
  if (!Array.isArray(list)) {
    return list;
  }
  return [...new Set(list.map(toE164String).filter(Boolean))];
}

function scrubCapabilities(cap) {
  if (!Array.isArray(cap)) {
    return [];
  }
  return cap.map((c) => String(c).trim()).filter(Boolean);
}

function applyRecoveryProfile(cfg) {
  const c = JSON.parse(JSON.stringify(cfg));
  c.session = { ...c.session, dmScope: "per-channel-peer" };
  c.channels = c.channels ?? {};
  c.channels.whatsapp = { ...c.channels.whatsapp };
  const wa = c.channels.whatsapp;
  wa.enabled = true;
  wa.dmPolicy = "allowlist";
  wa.selfChatMode = false;
  wa.debounceMs = 1500;
  wa.allowFrom = normalizeStringList(wa.allowFrom ?? []);
  wa.groupAllowFrom = normalizeStringList(wa.groupAllowFrom ?? []);
  wa.capabilities = scrubCapabilities(wa.capabilities);
  c.commands = c.commands ?? {};
  c.commands.allowFrom = c.commands.allowFrom ?? {};
  if (c.commands.allowFrom.whatsapp) {
    c.commands.allowFrom.whatsapp = normalizeStringList(c.commands.allowFrom.whatsapp);
  }
  c.tools = c.tools ?? {};
  c.tools.elevated = c.tools.elevated ?? {};
  c.tools.elevated.allowFrom = c.tools.elevated.allowFrom ?? {};
  if (c.tools.elevated.allowFrom.whatsapp) {
    c.tools.elevated.allowFrom.whatsapp = normalizeStringList(c.tools.elevated.allowFrom.whatsapp);
  }
  c.meta = c.meta ?? {};
  c.meta.lastTouchedAt = new Date().toISOString();
  c.meta.recoveryBootstrap = {
    source: "bootstrap-whatsapp-recovery-home.mjs",
    baseConfigPath: basePath,
  };
  return c;
}

const raw = fs.readFileSync(basePath, "utf8");
const parsed = JSON.parse(raw);
const out = applyRecoveryProfile(parsed);
const outPath = path.join(recoveryRoot, "openclaw.json");
fs.mkdirSync(recoveryRoot, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
console.log(`sha256=${crypto.createHash("sha256").update(fs.readFileSync(outPath)).digest("hex")}`);
