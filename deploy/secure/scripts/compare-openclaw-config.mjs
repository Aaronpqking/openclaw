#!/usr/bin/env node
/**
 * Compare two OpenClaw config JSON files (e.g. backups, openclaw.json.before-revert.*).
 *
 * Usage:
 *   node deploy/secure/scripts/compare-openclaw-config.mjs <pathA> <pathB>
 *   node deploy/secure/scripts/compare-openclaw-config.mjs --redact <pathA> <pathB>
 *
 * Prints SHA-256 for each file, then a path-focused diff for WhatsApp / allowlists / meta.
 * Default mode redacts likely secrets and phone-like strings (last 4 digits kept for matching).
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
let redact = true;
let paths = args;
if (paths[0] === "--no-redact") {
  redact = false;
  paths = paths.slice(1);
}
if (paths[0] === "--redact") {
  redact = true;
  paths = paths.slice(1);
}

if (paths.length !== 2) {
  console.error(
    "Usage: compare-openclaw-config.mjs [--redact|--no-redact] <configA.json> <configB.json>",
  );
  process.exit(64);
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function redactPhone(s) {
  if (typeof s !== "string") {
    return s;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 10) {
    return `***${digits.slice(-4)}`;
  }
  return "[redacted]";
}

function redactDeep(v) {
  if (v == null) {
    return v;
  }
  if (typeof v === "string") {
    if (/^\+?\d[\d\s\-()]{8,}\d$/.test(v.trim()) || /^\d{10,15}$/.test(v.replace(/\D/g, ""))) {
      return redactPhone(v);
    }
    if (v.length > 120) {
      return `${v.slice(0, 60)}…[truncated]`;
    }
    return v;
  }
  if (Array.isArray(v)) {
    return v.map(redactDeep);
  }
  if (typeof v === "object") {
    const o = {};
    for (const [k, val] of Object.entries(v)) {
      if (/token|password|secret|credential|apiKey|api_key/i.test(k)) {
        o[k] = "[redacted]";
      } else {
        o[k] = redactDeep(val);
      }
    }
    return o;
  }
  return v;
}

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

const [aPath, bPath] = paths;
const ha = sha256File(aPath);
const hb = sha256File(bPath);

console.log("=== SHA-256 ===");
console.log(`${ha}  ${path.basename(aPath)} (${fs.statSync(aPath).size} bytes)`);
console.log(`${hb}  ${path.basename(bPath)} (${fs.statSync(bPath).size} bytes)`);
if (ha === hb) {
  console.log("\nFiles are identical (hash match).");
  process.exit(0);
}

const a = loadJson(aPath);
const b = loadJson(bPath);

const sections = [
  ["channels", "whatsapp"],
  ["commands", "allowFrom"],
  ["tools", "elevated", "allowFrom"],
  ["agents"],
  ["gateway"],
  ["meta"],
];

function pick(obj, keys) {
  let x = obj;
  for (const k of keys) {
    x = x?.[k];
  }
  return x;
}

console.log("\n=== Section diff (paths listed below) ===\n");

for (const keys of sections) {
  const label = keys.join(".");
  let x = pick(a, keys);
  let y = pick(b, keys);
  if (redact) {
    x = redactDeep(x);
    y = redactDeep(y);
  }
  const sx = JSON.stringify(x, null, 2);
  const sy = JSON.stringify(y, null, 2);
  if (sx === sy) {
    console.log(`[SAME] ${label}`);
  } else {
    console.log(`[DIFF] ${label}`);
    console.log(`--- ${path.basename(aPath)}`);
    console.log(sx);
    console.log(`--- ${path.basename(bPath)}`);
    console.log(sy);
    console.log("");
  }
}

console.log(
  "\nTip: preimage before a bad config.set is often only on backups; compare audit log previousHash to sha256 above.",
);
