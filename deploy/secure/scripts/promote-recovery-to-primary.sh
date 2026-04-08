#!/usr/bin/env bash
# Promote recovery bind to the primary openclaw service after probes pass.
# Stops the parallel recovery container, then recreates `openclaw` with recovery.override.yml.
#
# Usage (on gateway host, from deploy/secure):
#   eval "$(./scripts/resolve-openclaw-host-home.sh)"
#   export RECOVERY_HOME   # must match prepared recovery home
#   export HOME="${OPENCLAW_HOST_HOME}"   # compose base file uses HOME for legacy paths
#   ./scripts/promote-recovery-to-primary.sh
#
# Stops: openclaw-recovery service (container_name secure-openclaw-recovery-1 when using parallel compose)
# Recreates: openclaw + nginx (brief interruption for primary traffic)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${RECOVERY_HOME:?set RECOVERY_HOME}"
: "${OPENCLAW_HOST_HOME:?eval resolve-openclaw-host-home.sh first}"
export HOME="${OPENCLAW_HOST_HOME}"

COMPOSE_BASE="${ROOT}/docker-compose.secure.yml"
COMPOSE_PARALLEL="${ROOT}/docker-compose.recovery-parallel.yml"
COMPOSE_PROMOTE="${ROOT}/docker-compose.recovery.override.yml"

cd "${ROOT}"

echo "Stopping parallel recovery service (no shared RW with primary)..."
docker compose -f "${COMPOSE_BASE}" -f "${COMPOSE_PARALLEL}" stop openclaw-recovery 2>/dev/null || true
docker compose -f "${COMPOSE_BASE}" -f "${COMPOSE_PARALLEL}" rm -f openclaw-recovery 2>/dev/null || true

echo "Recreating primary openclaw with RECOVERY_HOME bind..."
docker compose -f "${COMPOSE_BASE}" -f "${COMPOSE_PROMOTE}" up -d --force-recreate openclaw

echo "Recreating nginx (depends on openclaw healthy)..."
docker compose -f "${COMPOSE_BASE}" -f "${COMPOSE_PROMOTE}" up -d nginx

echo "Done. Primary gateway now uses ${RECOVERY_HOME}; verify nginx :8080 and WhatsApp."
