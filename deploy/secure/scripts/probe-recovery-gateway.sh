#!/usr/bin/env bash
# Minimal automated checks against the parallel recovery gateway (run on the gateway host).
# Does not replace sender A/B manual WhatsApp tests.
#
# Usage:
#   RECOVERY_PORT=18790 ./probe-recovery-gateway.sh
#
# Requires: curl, docker

set -euo pipefail
PORT="${RECOVERY_PORT:-18790}"
CONTAINER="${RECOVERY_CONTAINER:-secure-openclaw-recovery-1}"

echo "== healthz http://127.0.0.1:${PORT}/healthz =="
curl -fsS "http://127.0.0.1:${PORT}/healthz"
echo ""

echo "== readyz (optional) =="
curl -fsS "http://127.0.0.1:${PORT}/readyz" 2>/dev/null || echo "(no readyz or not exposed)"

echo "== cron: no enabled jobs (inside recovery home) =="
docker exec "${CONTAINER}" node -e "
const fs = require('fs');
const p = '/home/node/.openclaw/cron/jobs.json';
if (!fs.existsSync(p)) { console.log('no jobs.json'); process.exit(0); }
const j = JSON.parse(fs.readFileSync(p,'utf8'));
const bad = (j.jobs || []).filter((x) => x.enabled === true);
console.log('enabled job count:', bad.length);
if (bad.length) { console.log(JSON.stringify(bad.map((x) => x.name), null, 2)); process.exit(1); }
console.log('ok: all jobs disabled');
"

echo "== channel status --probe (in-container; hits local gateway) =="
docker exec "${CONTAINER}" node dist/index.js channels status --probe --timeout 15000 || {
  echo "channels status failed (check token / linking inside recovery config)" >&2
  exit 1
}

echo "probe script finished; complete manual sender A/B and cross-talk checks before promotion."
