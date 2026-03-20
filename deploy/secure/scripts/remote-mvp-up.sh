#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage: deploy/secure/scripts/remote-mvp-up.sh user@host [remote_dir]

Deploy the secure MVP stack to a remote Linux host over SSH, then enable
Tailscale Serve on that host.

Required local environment:
  OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD
EOF
}

quote() {
  printf '%q' "$1"
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 64
fi

if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" && -z "${OPENCLAW_GATEWAY_PASSWORD:-}" ]]; then
  echo "Set OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD before deploying" >&2
  exit 64
fi

host="$1"
remote_dir="${2:-~/openclaw}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$script_dir/remote-sync.sh" "$host" "$remote_dir"

remote_home="$(ssh "$host" 'printf %s "$HOME"')"
remote_dir_abs="$(ssh "$host" "cd $remote_dir && pwd")"
quoted_remote_dir="$(quote "$remote_dir_abs")"
quoted_remote_home="$(quote "$remote_home")"
quoted_token="$(quote "${OPENCLAW_GATEWAY_TOKEN:-}")"
quoted_password="$(quote "${OPENCLAW_GATEWAY_PASSWORD:-}")"

ssh "$host" "
  set -euo pipefail
  command -v docker >/dev/null 2>&1
  command -v tailscale >/dev/null 2>&1
  docker version >/dev/null
  tailscale status >/dev/null
  mkdir -p $quoted_remote_home/.openclaw/workspace $quoted_remote_home/.openclaw
  cd $quoted_remote_dir
  HOME=$quoted_remote_home \
  OPENCLAW_GATEWAY_TOKEN=$quoted_token \
  OPENCLAW_GATEWAY_PASSWORD=$quoted_password \
  docker compose -f deploy/secure/docker-compose.secure.yml config >/dev/null
  HOME=$quoted_remote_home \
  OPENCLAW_GATEWAY_TOKEN=$quoted_token \
  OPENCLAW_GATEWAY_PASSWORD=$quoted_password \
  docker compose -f deploy/secure/docker-compose.secure.yml up -d --build
  tailscale serve --bg --https=443 http://127.0.0.1:8080
  tailscale serve status
"

echo "Remote MVP secure stack is up on $host"
