#!/usr/bin/env bash
# Run WhatsApp recovery probe + promote workflow on the REAL production gateway only.
# Creates deploy/secure/artifacts/whatsapp_promote_prod_YYYYMMDD_HHMMSS/ with numbered logs.
#
# Usage (from deploy/secure):
#   chmod +x scripts/whatsapp-promote-prod-artifacts.sh
#   ./scripts/whatsapp-promote-prod-artifacts.sh
#
# Optional: PRIMARY_CONTAINER=secure-openclaw-1 (default) if your primary has another name.
#
# Stops immediately if host proof fails (not production). Does not use Control UI.

set -euo pipefail

PRIMARY_CONTAINER="${PRIMARY_CONTAINER:-secure-openclaw-1}"
RECOVERY_CONTAINER="${RECOVERY_CONTAINER:-secure-openclaw-recovery-1}"
NGINX_CONTAINER="${NGINX_CONTAINER:-secure-nginx-1}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

TS="$(date -u +%Y%m%d_%H%M%S)"
ART="${ROOT}/artifacts/whatsapp_promote_prod_${TS}"
mkdir -p "${ART}/backup"

fail() {
  echo "$*" | tee -a "${ART}/08_failure_logs.txt"
}

write_final() {
  local promoted="$1" host_ok="$2" path_used="$3" safe="$4"
  cat > "${ART}/09_final_status.md" << EOF
# WhatsApp promote — final status (automated run)

**Artifact directory:** \`deploy/secure/artifacts/whatsapp_promote_prod_${TS}/\`

## Host proved production

**${host_ok}**

## Promotion succeeded

**${promoted}**

## OPENCLAW_HOST_HOME

\`${OPENCLAW_HOST_HOME:-<unset>}\`

## RECOVERY_HOME

\`${RECOVERY_HOME:-<unset>}\`

## Recovery probe result

See \`04_recovery_probe.txt\`.

## Cron/session gate result

See \`05_cron_session_audit.txt\`.

## Promotion path used

**${path_used}**

## Safe to resume WhatsApp production testing

**${safe}**

## Next steps

If blocked, SSH to the production gateway, ensure repo \`deploy/secure\` matches this tree, and re-run this script. If probe passes but manual A/B WhatsApp checks are still required, complete those before trusting traffic.
EOF
}

# --- PHASE 0: host proof ---
{
  echo "=== hostname ==="
  hostname
  echo "=== whoami ==="
  whoami
  echo "=== pwd ==="
  pwd
  echo "=== date -u ==="
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  echo "=== docker ps ==="
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' 2>&1
  echo "=== ls -la ~/.openclaw ==="
  ls -la ~/.openclaw 2>&1 || true
  echo "=== secure-mvp.env ==="
  test -f ~/.openclaw/secure-mvp.env && echo ENV_PRESENT || echo ENV_MISSING
  echo "=== git (deploy/secure) ==="
  git branch --show-current 2>&1
  git rev-parse --short HEAD 2>&1
  echo "=== docker compose version ==="
  docker compose version 2>&1
} > "${ART}/00_host_proof.txt" 2>&1

{
  echo "Extended environment capture for operator records."
  echo "See 00_host_proof.txt for Phase 0 table."
  uname -a 2>&1 || true
  echo "HOME=${HOME}"
} > "${ART}/01_environment.txt"

PROD_OK=0
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "${PRIMARY_CONTAINER}"; then
  PROD_OK=1
fi
if test -f "${HOME}/.openclaw/secure-mvp.env"; then
  PROD_OK=1
fi
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E '^(secure-openclaw-1|secure-openclaw-recovery-1|secure-nginx-1)$' >/dev/null 2>&1; then
  PROD_OK=1
fi

if [[ "${PROD_OK}" -ne 1 ]]; then
  echo "Not on production host." | tee -a "${ART}/00_host_proof.txt"
  fail "Phase 0: production proof failed (need container ${PRIMARY_CONTAINER} or ~/.openclaw/secure-mvp.env or secure stack names)."
  write_final "NO" "NO" "none" "NO"
  exit 1
fi

# --- PHASE 1: resolve ---
set +e
eval "$(./scripts/resolve-openclaw-host-home.sh "${PRIMARY_CONTAINER}")" 2> "${ART}/resolve_stderr.txt"
RC=$?
set -e
{
  echo "exit_code=${RC}"
  cat "${ART}/resolve_stderr.txt" 2>/dev/null || true
  if [[ "${RC}" -eq 0 ]]; then
    printf 'OPENCLAW_HOST_HOME=%s\nRECOVERY_HOME=%s\nHOME=%s\n' "${OPENCLAW_HOST_HOME}" "${RECOVERY_HOME}" "${HOME}"
    export HOME="${OPENCLAW_HOST_HOME}"
    printf 'After export HOME=OPENCLAW_HOST_HOME:\nHOME=%s\n' "${HOME}"
    ls -la "${OPENCLAW_HOST_HOME}" 2>&1
  fi
} > "${ART}/02_resolved_home.txt" 2>&1
rm -f "${ART}/resolve_stderr.txt"

if [[ "${RC}" -ne 0 ]] || [[ -z "${OPENCLAW_HOST_HOME:-}" ]]; then
  fail "Phase 1: resolve-openclaw-host-home.sh failed or OPENCLAW_HOST_HOME empty."
  write_final "NO" "YES" "none" "NO"
  exit 1
fi

export HOME="${OPENCLAW_HOST_HOME}"

# --- PHASE 2: backup ---
{
  echo "Backing up ${OPENCLAW_HOST_HOME}/.openclaw to ${ART}/backup/"
  if [[ -d "${OPENCLAW_HOST_HOME}/.openclaw" ]]; then
    cp -a "${OPENCLAW_HOST_HOME}/.openclaw" "${ART}/backup/" 2>&1
    du -sh "${ART}/backup/.openclaw" 2>&1 || true
    find "${ART}/backup" -type f | wc -l
  else
    echo "No legacy .openclaw directory at ${OPENCLAW_HOST_HOME}/.openclaw"
  fi
  echo "=== compose ps (secure only) ==="
  docker compose -f docker-compose.secure.yml ps 2>&1
  echo "=== docker logs ${PRIMARY_CONTAINER} (tail 300) ==="
  docker logs "${PRIMARY_CONTAINER}" 2>&1 | tail -n 300
  echo "=== docker logs ${NGINX_CONTAINER} (tail 200) ==="
  docker logs "${NGINX_CONTAINER}" 2>&1 | tail -n 200
} > "${ART}/03_pre_cutover_backup.txt" 2>&1

# --- PHASE 3: recovery probe ---
set +e
./scripts/probe-recovery-gateway.sh 2>&1 | tee "${ART}/04_recovery_probe.txt"
PROBE_RC=${PIPESTATUS[0]}
set -e
{
  echo ""
  echo "=== compose ps (secure + parallel) ==="
  docker compose -f docker-compose.secure.yml -f docker-compose.recovery-parallel.yml ps 2>&1
  echo "=== docker logs ${RECOVERY_CONTAINER} (tail 200) ==="
  docker logs "${RECOVERY_CONTAINER}" 2>&1 | tail -n 200
} >> "${ART}/04_recovery_probe.txt" 2>&1

if [[ "${PROBE_RC}" -ne 0 ]]; then
  fail "Phase 3: probe-recovery-gateway.sh failed with exit ${PROBE_RC}."
  write_final "NO" "YES" "none" "NO"
  exit 1
fi

# --- PHASE 4: cron / session gate (recovery runtime) ---
set +e
docker exec "${RECOVERY_CONTAINER}" node -e "
const fs = require('fs');
const p = '/home/node/.openclaw/cron/jobs.json';
if (!fs.existsSync(p)) {
  console.log('RESULT=UNKNOWN (no jobs.json)');
  process.exit(2);
}
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
const bad = [];
for (const job of j.jobs || []) {
  if (job.enabled !== true) continue;
  const blob = JSON.stringify(job).toLowerCase();
  const wa = blob.includes('whatsapp');
  const mainSess = blob.includes('agent:main:main') || blob.includes('session:agent:main:main');
  if (wa && mainSess) bad.push(job.name || '(unnamed)');
}
if (bad.length) {
  console.log('RESULT=FAIL enabled WhatsApp-related job(s) still reference shared main session:', JSON.stringify(bad));
  process.exit(1);
}
console.log('RESULT=PASS (no enabled WhatsApp job targeting shared main session in jobs.json)');
process.exit(0);
" > "${ART}/05_cron_session_audit.txt" 2>&1
CRON_RC=$?
set -e

if [[ "${CRON_RC}" -eq 1 ]]; then
  fail "Phase 4: cron/session gate FAIL."
  write_final "NO" "YES" "none" "NO"
  exit 1
fi
if [[ "${CRON_RC}" -ne 0 ]]; then
  fail "Phase 4: cron/session gate UNKNOWN (exit ${CRON_RC})."
  write_final "NO" "YES" "none" "NO"
  exit 1
fi

# --- PHASE 5: promote (scripted first) ---
{
  echo "Scripted promotion commands:"
  echo "  eval \"\$(./scripts/resolve-openclaw-host-home.sh ${PRIMARY_CONTAINER})\""
  echo "  export HOME=\"\${OPENCLAW_HOST_HOME}\""
  echo "  ./scripts/promote-recovery-to-primary.sh"
  echo ""
} > "${ART}/06_promote_command.txt"

set +e
eval "$(./scripts/resolve-openclaw-host-home.sh "${PRIMARY_CONTAINER}")"
export HOME="${OPENCLAW_HOST_HOME}"
./scripts/promote-recovery-to-primary.sh >> "${ART}/06_promote_command.txt" 2>&1
PROMOTE_RC=$?
set -e

PROMOTE_PATH="scripted"
if [[ "${PROMOTE_RC}" -ne 0 ]]; then
  {
    echo ""
    echo "Scripted promote failed (exit ${PROMOTE_RC}). Attempting manual compose fallback..."
    docker compose -f docker-compose.secure.yml -f docker-compose.recovery-parallel.yml stop openclaw-recovery 2>&1
    docker compose -f docker-compose.secure.yml -f docker-compose.recovery-parallel.yml rm -f openclaw-recovery 2>&1
    docker compose -f docker-compose.secure.yml -f docker-compose.recovery.override.yml up -d --force-recreate openclaw nginx 2>&1
  } >> "${ART}/06_promote_command.txt" 2>&1
  set +e
  docker compose -f docker-compose.secure.yml -f docker-compose.recovery.override.yml ps >/dev/null 2>&1
  FALLBACK_RC=$?
  set -e
  if [[ "${FALLBACK_RC}" -ne 0 ]]; then
    fail "Phase 5: both scripted and manual promotion failed."
    write_final "NO" "YES" "scripted+manual(failed)" "NO"
    exit 1
  fi
  PROMOTE_PATH="manual_fallback"
fi

# --- PHASE 6: post-cutover ---
{
  echo "=== compose ps (secure + recovery.override) ==="
  docker compose -f docker-compose.secure.yml -f docker-compose.recovery.override.yml ps 2>&1
  echo "=== docker logs ${PRIMARY_CONTAINER} (tail 200) ==="
  docker logs "${PRIMARY_CONTAINER}" 2>&1 | tail -n 200
  echo "=== docker logs ${NGINX_CONTAINER} (tail 200) ==="
  docker logs "${NGINX_CONTAINER}" 2>&1 | tail -n 200
} > "${ART}/07_post_cutover_validation.txt" 2>&1

# Heuristic: look for obvious errors in primary tail
if grep -qiE 'channel is required|fatal|crash|ECONNREFUSED' "${ART}/07_post_cutover_validation.txt"; then
  fail "Phase 6: post-cutover log scan found possible errors (see 07_post_cutover_validation.txt)."
  write_final "YES" "YES" "${PROMOTE_PATH}" "NO"
  exit 1
fi

write_final "YES" "YES" "${PROMOTE_PATH}" "YES"
echo "Done. Artifacts: ${ART}"
exit 0
