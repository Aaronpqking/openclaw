#!/usr/bin/env bash
# Prepare a fresh OpenClaw home for WhatsApp recovery (run on the Linux gateway host as root).
# Does not modify the existing legacy home except reading openclaw.json.bak and cron/jobs.json.
#
# Usage:
#   RECOVERY_HOME=/root/.openclaw-recovery OPENCLAW_IMAGE=openclaw:secure-mvp \
#     ./prepare-recovery-runtime.sh /path/to/bootstrap-whatsapp-recovery-home.mjs

set -euo pipefail

RECOVERY_HOME="${RECOVERY_HOME:-/root/.openclaw-recovery}"
LEGACY_HOME="${LEGACY_HOME:-/root/.openclaw}"
OPENCLAW_IMAGE="${OPENCLAW_IMAGE:-openclaw:secure-mvp}"
SCRIPT="${1:?bootstrap-whatsapp-recovery-home.mjs path on this host}"

mkdir -p "${RECOVERY_HOME}/workspace" "${RECOVERY_HOME}/cron" "${RECOVERY_HOME}/logs" "${RECOVERY_HOME}/canvas"
mkdir -p "${RECOVERY_HOME}/xdg-config"

# Container runs as uid 1000 (node); ensure the recovery tree is writable.
chown -R 1000:1000 "${RECOVERY_HOME}" 2>/dev/null || true

if [[ -d "${LEGACY_HOME}/credentials" ]]; then
  cp -a "${LEGACY_HOME}/credentials" "${RECOVERY_HOME}/"
fi
if [[ -f "${LEGACY_HOME}/secure-mvp.env" ]]; then
  cp -a "${LEGACY_HOME}/secure-mvp.env" "${RECOVERY_HOME}/"
fi
chown -R 1000:1000 "${RECOVERY_HOME}" 2>/dev/null || true

docker run --rm \
  -e "OPENCLAW_RECOVERY_ROOT=/out" \
  -e "OPENCLAW_RECOVERY_BASE_CONFIG=/legacy/openclaw.json.bak" \
  -v "${LEGACY_HOME}:/legacy:ro" \
  -v "${RECOVERY_HOME}:/out" \
  -v "${SCRIPT}:/bootstrap.mjs:ro" \
  "${OPENCLAW_IMAGE}" \
  node /bootstrap.mjs

docker run --rm \
  -v "${LEGACY_HOME}/cron/jobs.json:/jobs.json:ro" \
  -v "${RECOVERY_HOME}/cron:/outcron" \
  "${OPENCLAW_IMAGE}" \
  node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('/jobs.json', 'utf8'));
for (const job of j.jobs) {
  job.enabled = false;
}
fs.writeFileSync('/outcron/jobs.json', JSON.stringify(j, null, 2) + '\\n');
console.log('cron jobs disabled:', j.jobs.length);
"

echo "Recovery home prepared at ${RECOVERY_HOME}"
sha256sum "${RECOVERY_HOME}/openclaw.json"
