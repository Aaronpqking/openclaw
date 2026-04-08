#!/usr/bin/env bash
# Print export lines for OPENCLAW_HOST_HOME and RECOVERY_HOME from the running primary gateway container.
# Usage:
#   eval "$(deploy/secure/scripts/resolve-openclaw-host-home.sh secure-openclaw-1)"
# Optional first arg: container name (default: secure-openclaw-1)

set -euo pipefail
CONTAINER="${1:-secure-openclaw-1}"
src="$(docker inspect "${CONTAINER}" --format '{{range .Mounts}}{{if eq .Destination "/home/node/.openclaw"}}{{.Source}}{{end}}{{end}}' | head -1)"
if [[ -z "${src}" ]]; then
  echo "error: could not find /home/node/.openclaw mount on ${CONTAINER}" >&2
  exit 1
fi
home="$(dirname "${src}")"
echo "export OPENCLAW_HOST_HOME=${home}"
echo "export RECOVERY_HOME=${home}/.openclaw-recovery"
echo "# legacy config dir on host: ${src}"
