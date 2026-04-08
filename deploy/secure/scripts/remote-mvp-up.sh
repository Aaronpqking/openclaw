#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage: deploy/secure/scripts/remote-mvp-up.sh [--no-build] user@host [remote_dir]

Deploy the secure MVP stack to a remote Linux host over SSH, then enable
Tailscale Serve on that host.

  --no-build   Run `docker compose up -d` without `--build` (use after the image
               already exists on the host; skips rebuilding the OpenClaw image).

Required local environment:
  OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD
Optional local environment:
  OPENAI_API_KEY
  GEMINI_API_KEY
  GROQ_API_KEY
  DEEPSEEK_API_KEY
EOF
}

quote() {
  printf '%q' "$1"
}

no_build=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      no_build=1
      shift
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      exit 64
      ;;
    *)
      break
      ;;
  esac
done

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
if [[ "$no_build" -eq 1 ]]; then
  compose_up_flags="-d --no-build"
else
  compose_up_flags="-d --build"
fi
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$script_dir/remote-sync.sh" "$host" "$remote_dir"

remote_home="$(ssh "$host" 'printf %s "$HOME"')"
remote_dir_abs="$(ssh "$host" "cd $remote_dir && pwd")"
quoted_remote_dir="$(quote "$remote_dir_abs")"
quoted_remote_home="$(quote "$remote_home")"
quoted_token="$(quote "${OPENCLAW_GATEWAY_TOKEN:-}")"
quoted_password="$(quote "${OPENCLAW_GATEWAY_PASSWORD:-}")"
quoted_openai="$(quote "${OPENAI_API_KEY:-}")"
quoted_gemini="$(quote "${GEMINI_API_KEY:-}")"
quoted_groq="$(quote "${GROQ_API_KEY:-}")"
quoted_deepseek="$(quote "${DEEPSEEK_API_KEY:-}")"

ssh "$host" "
  set -euo pipefail
  command -v docker >/dev/null 2>&1
  command -v tailscale >/dev/null 2>&1
  docker version >/dev/null
  tailscale status >/dev/null
  mkdir -p $quoted_remote_home/.openclaw/workspace $quoted_remote_home/.openclaw
  env_file=$quoted_remote_home/.openclaw/secure-mvp.env
  if [ -f \"\$env_file\" ]; then
    set -a
    . \"\$env_file\"
    set +a
  fi
  if [ -n $quoted_token ]; then
    OPENCLAW_GATEWAY_TOKEN=$quoted_token
  fi
  if [ -n $quoted_password ]; then
    OPENCLAW_GATEWAY_PASSWORD=$quoted_password
  fi
  if [ -n $quoted_openai ]; then
    OPENAI_API_KEY=$quoted_openai
  fi
  if [ -n $quoted_gemini ]; then
    GEMINI_API_KEY=$quoted_gemini
  fi
  if [ -n $quoted_groq ]; then
    GROQ_API_KEY=$quoted_groq
  fi
  if [ -n $quoted_deepseek ]; then
    DEEPSEEK_API_KEY=$quoted_deepseek
  fi
  umask 077
  : > \"\$env_file\"
  if [ -n \"\${OPENCLAW_GATEWAY_TOKEN:-}\" ]; then
    printf 'OPENCLAW_GATEWAY_TOKEN=%q\n' \"\$OPENCLAW_GATEWAY_TOKEN\" >> \"\$env_file\"
  fi
  if [ -n \"\${OPENCLAW_GATEWAY_PASSWORD:-}\" ]; then
    printf 'OPENCLAW_GATEWAY_PASSWORD=%q\n' \"\$OPENCLAW_GATEWAY_PASSWORD\" >> \"\$env_file\"
  fi
  if [ -n \"\${OPENAI_API_KEY:-}\" ]; then
    printf 'OPENAI_API_KEY=%q\n' \"\$OPENAI_API_KEY\" >> \"\$env_file\"
  fi
  if [ -n \"\${GEMINI_API_KEY:-}\" ]; then
    printf 'GEMINI_API_KEY=%q\n' \"\$GEMINI_API_KEY\" >> \"\$env_file\"
  fi
  if [ -n \"\${GROQ_API_KEY:-}\" ]; then
    printf 'GROQ_API_KEY=%q\n' \"\$GROQ_API_KEY\" >> \"\$env_file\"
  fi
  if [ -n \"\${DEEPSEEK_API_KEY:-}\" ]; then
    printf 'DEEPSEEK_API_KEY=%q\n' \"\$DEEPSEEK_API_KEY\" >> \"\$env_file\"
  fi
  cd $quoted_remote_dir
  HOME=$quoted_remote_home \
  bash deploy/secure/scripts/runtime-permissions-preflight.sh --apply
  HOME=$quoted_remote_home \
  OPENCLAW_GATEWAY_TOKEN=\${OPENCLAW_GATEWAY_TOKEN:-} \
  OPENCLAW_GATEWAY_PASSWORD=\${OPENCLAW_GATEWAY_PASSWORD:-} \
  OPENAI_API_KEY=\${OPENAI_API_KEY:-} \
  GEMINI_API_KEY=\${GEMINI_API_KEY:-} \
  GROQ_API_KEY=\${GROQ_API_KEY:-} \
  DEEPSEEK_API_KEY=\${DEEPSEEK_API_KEY:-} \
  docker compose -f deploy/secure/docker-compose.secure.yml config >/dev/null
  HOME=$quoted_remote_home \
  OPENCLAW_GATEWAY_TOKEN=\${OPENCLAW_GATEWAY_TOKEN:-} \
  OPENCLAW_GATEWAY_PASSWORD=\${OPENCLAW_GATEWAY_PASSWORD:-} \
  OPENAI_API_KEY=\${OPENAI_API_KEY:-} \
  GEMINI_API_KEY=\${GEMINI_API_KEY:-} \
  GROQ_API_KEY=\${GROQ_API_KEY:-} \
  DEEPSEEK_API_KEY=\${DEEPSEEK_API_KEY:-} \
  docker compose -f deploy/secure/docker-compose.secure.yml up $compose_up_flags
  tailscale serve --bg --https=443 http://127.0.0.1:8080
  tailscale serve status
"

echo "Remote MVP secure stack is up on $host"
