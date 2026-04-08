#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF' >&2
Usage: deploy/secure/scripts/runtime-permissions-preflight.sh [--apply] [--state-dir <dir>] [--runtime-uid <uid>] [--runtime-gid <gid>]

Validate (or apply) secure OpenClaw runtime permissions split:
- protected control-plane files: runtime-readable, runtime-non-writable
- writable runtime data directories: runtime-writable

Defaults:
- state dir: $HOME/.openclaw
- runtime uid/gid: 1000:1000 (container node user)
EOF
}

apply=0
state_dir="${HOME}/.openclaw"
runtime_uid="1000"
runtime_gid="1000"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      apply=1
      shift
      ;;
    --state-dir)
      state_dir="${2:-}"
      shift 2
      ;;
    --runtime-uid)
      runtime_uid="${2:-}"
      shift 2
      ;;
    --runtime-gid)
      runtime_gid="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 64
      ;;
  esac
done

if [[ -z "${state_dir}" ]]; then
  echo "state dir is required" >&2
  exit 64
fi

ensure_dir() {
  local dir="$1"
  if [[ ! -d "${dir}" ]]; then
    if [[ "${apply}" -eq 1 ]]; then
      mkdir -p "${dir}"
    else
      echo "missing directory: ${dir}" >&2
      return 1
    fi
  fi
}

set_mode_owner() {
  local target="$1"
  local mode="$2"
  local owner="$3"
  local group="$4"
  if [[ "${apply}" -eq 1 ]]; then
    chown "${owner}:${group}" "${target}"
    chmod "${mode}" "${target}"
  fi
}

read_stat() {
  local target="$1"
  if stat -c '%u %g %a' "${target}" >/dev/null 2>&1; then
    stat -c '%u %g %a' "${target}"
    return 0
  fi
  if stat -f '%u %g %OLp' "${target}" >/dev/null 2>&1; then
    stat -f '%u %g %OLp' "${target}"
    return 0
  fi
  echo "unable to read stat for ${target}" >&2
  return 1
}

runtime_can_read() {
  local uid="$1"
  local gid="$2"
  local mode="$3"
  local owner_uid="$4"
  local owner_gid="$5"
  local octal="${mode#0}"
  local owner_perm=$(( 10#${octal:0:1} ))
  local group_perm=$(( 10#${octal:1:1} ))
  local other_perm=$(( 10#${octal:2:1} ))
  if [[ "${uid}" == "${owner_uid}" ]]; then
    (( owner_perm & 4 )) && return 0
    return 1
  fi
  if [[ "${gid}" == "${owner_gid}" ]]; then
    (( group_perm & 4 )) && return 0
    return 1
  fi
  (( other_perm & 4 )) && return 0
  return 1
}

runtime_can_write() {
  local uid="$1"
  local gid="$2"
  local mode="$3"
  local owner_uid="$4"
  local owner_gid="$5"
  local octal="${mode#0}"
  local owner_perm=$(( 10#${octal:0:1} ))
  local group_perm=$(( 10#${octal:1:1} ))
  local other_perm=$(( 10#${octal:2:1} ))
  if [[ "${uid}" == "${owner_uid}" ]]; then
    (( owner_perm & 2 )) && return 0
    return 1
  fi
  if [[ "${gid}" == "${owner_gid}" ]]; then
    (( group_perm & 2 )) && return 0
    return 1
  fi
  (( other_perm & 2 )) && return 0
  return 1
}

fail_count=0
check() {
  local message="$1"
  if ! eval "$2"; then
    echo "FAIL: ${message}" >&2
    fail_count=$((fail_count + 1))
  else
    echo "OK: ${message}"
  fi
}

ensure_dir "${state_dir}"
set_mode_owner "${state_dir}" 751 0 "${runtime_gid}"

protected_files=(
  "${state_dir}/openclaw.json"
  "${state_dir}/exec-approvals.json"
)

writable_dirs=(
  "${state_dir}/agents"
  "${state_dir}/canvas"
  "${state_dir}/cron"
  "${state_dir}/logs"
  "${state_dir}/sessions"
  "${state_dir}/workspace"
)

for dir in "${writable_dirs[@]}"; do
  ensure_dir "${dir}"
  set_mode_owner "${dir}" 770 "${runtime_uid}" "${runtime_gid}"
  if [[ "${apply}" -eq 1 ]]; then
    chown -R "${runtime_uid}:${runtime_gid}" "${dir}"
  fi
done

for file in "${protected_files[@]}"; do
  if [[ -e "${file}" ]]; then
    set_mode_owner "${file}" 640 0 "${runtime_gid}"
  fi
done

echo "== Protected paths =="
for file in "${protected_files[@]}"; do
  if [[ ! -e "${file}" ]]; then
    echo "WARN: protected file missing: ${file}"
    continue
  fi
  stat_line="$(read_stat "${file}")"
  read -r owner_uid owner_gid mode <<<"${stat_line}"
  check "${file} owner root" "[[ \"${owner_uid}\" == \"0\" ]]"
  check "${file} runtime-readable" "runtime_can_read \"${runtime_uid}\" \"${runtime_gid}\" \"${mode}\" \"${owner_uid}\" \"${owner_gid}\""
  check "${file} runtime-not-writable" "! runtime_can_write \"${runtime_uid}\" \"${runtime_gid}\" \"${mode}\" \"${owner_uid}\" \"${owner_gid}\""
done

echo "== Writable runtime dirs =="
for dir in "${writable_dirs[@]}"; do
  stat_line="$(read_stat "${dir}")"
  read -r owner_uid owner_gid mode <<<"${stat_line}"
  check "${dir} runtime owner uid" "[[ \"${owner_uid}\" == \"${runtime_uid}\" ]]"
  check "${dir} runtime owner gid" "[[ \"${owner_gid}\" == \"${runtime_gid}\" ]]"
  check "${dir} runtime-writable" "runtime_can_write \"${runtime_uid}\" \"${runtime_gid}\" \"${mode}\" \"${owner_uid}\" \"${owner_gid}\""
done

if [[ -f "${state_dir}/exec-approvals.json" ]]; then
  echo "== GOG allowlist preflight =="
  check "exec approvals include gog binary allowlist pattern" "grep -Eq '\"pattern\"\\s*:\\s*\"/usr/local/bin/gog\"' \"${state_dir}/exec-approvals.json\" || grep -Eq '\"pattern\"\\s*:\\s*\"/usr/bin/gog\"' \"${state_dir}/exec-approvals.json\" || grep -Eq '\"pattern\"\\s*:\\s*\"/bin/gog\"' \"${state_dir}/exec-approvals.json\""
fi

if [[ "${fail_count}" -gt 0 ]]; then
  echo "runtime permission preflight failed (${fail_count} check(s))" >&2
  exit 1
fi

echo "runtime permission preflight passed"
