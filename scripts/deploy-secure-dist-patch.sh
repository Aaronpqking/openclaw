#!/usr/bin/env bash
# Build locally, rsync dist/ to a secure-stack host, and restart the stack with the dist-patch overlay.
# No Docker image rebuild; requires docker-compose.dist-patch.override.yml (bind-mounts host dist/).
#
# Usage:
#   ./scripts/deploy-secure-dist-patch.sh [ssh-host]
# Env:
#   OPENCLAW_SECURE_DEPLOY_HOST   default: openclaw-secure-vm
#   OPENCLAW_SECURE_REPO          remote repo root containing deploy/secure (default: /root/openclaw)
#   SKIP_BUILD=1                  skip pnpm build && pnpm ui:build
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_HOST="${1:-${OPENCLAW_SECURE_DEPLOY_HOST:-openclaw-secure-vm}}"
REMOTE_REPO="${OPENCLAW_SECURE_REPO:-/root/openclaw}"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  (cd "$ROOT" && pnpm build && pnpm ui:build)
fi

if [[ ! -f "$ROOT/dist/index.js" ]]; then
  echo "error: $ROOT/dist/index.js missing; run pnpm build" >&2
  exit 1
fi

REMOTE_HOME="$(ssh -o BatchMode=yes "$DEPLOY_HOST" 'echo "$HOME"' | tr -d '\r')"
REMOTE_DIST="${REMOTE_HOME}/.openclaw/dist-patch-runtime"

ssh -o BatchMode=yes "$DEPLOY_HOST" "mkdir -p \"$REMOTE_DIST\""

echo "rsync dist/ -> ${DEPLOY_HOST}:${REMOTE_DIST}/"
rsync -az --delete -e 'ssh -o BatchMode=yes' \
  "$ROOT/dist/" "${DEPLOY_HOST}:${REMOTE_DIST}/"

echo "restarting stack with dist-patch overlay..."
ssh -o BatchMode=yes "$DEPLOY_HOST" \
  "cd \"$REMOTE_REPO\" && HOME=\$(echo \"\$HOME\" | tr -d '\r') bash deploy/secure/scripts/runtime-permissions-preflight.sh --apply && HOME=\$(echo \"\$HOME\" | tr -d '\r') docker compose \
    -f deploy/secure/docker-compose.secure.yml \
    -f deploy/secure/docker-compose.dist-patch.override.yml \
    up -d && HOME=\$(echo \"\$HOME\" | tr -d '\r') docker compose \
    -f deploy/secure/docker-compose.secure.yml \
    -f deploy/secure/docker-compose.dist-patch.override.yml \
    restart openclaw"

echo "done."
