#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage: deploy/secure/scripts/remote-sync.sh user@host [remote_dir]

Sync the current checkout to a remote Linux host so the secure Docker Compose
files can use host-local bind mounts there.
EOF
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 64
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required" >&2
  exit 69
fi

host="$1"
remote_dir="${2:-~/openclaw}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

ssh "$host" "mkdir -p $remote_dir"

rsync \
  -az \
  --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'coverage/' \
  --exclude '.tmp/' \
  --exclude '.DS_Store' \
  "$repo_root"/ \
  "$host:$remote_dir"/

echo "Synced $repo_root to $host:$remote_dir"
