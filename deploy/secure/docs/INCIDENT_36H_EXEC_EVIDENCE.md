# INCIDENT_36H_EXEC_EVIDENCE

## Evidence Preservation

- This pass remained read-only against runtime state.
- No config resets, no secret rotation, no log deletion, no cleanup/remediation commands were executed.
- Evidence root used for this analysis:
  - `deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/`
  - `deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/`

## Evidence Bundle Inventory

- Capture metadata: `00_capture_meta.txt`
- Local runtime/tool visibility: `01_openclaw_runtime_commands.txt`, `02_env_and_tool_visibility.txt`
- Local repo and persistence baseline: `04_repo_state.txt`, `14_path_and_bootstrap_contents.txt`, `15_persistence_artifacts.txt`
- Remote host/runtime/tool visibility: `remote_openclaw_secure/20_remote_host_env_tools.txt`
- Remote config audit and logs:
  - `remote_openclaw_secure/28_remote_config_audit_72h_events.tsv`
  - `remote_openclaw_secure/33_remote_config_audit_raw_tail_and_window.txt`
  - `remote_openclaw_secure/42_remote_gateway_runtime_focus.txt`
  - `remote_openclaw_secure/43_remote_critical_state_redacted.txt`
  - `remote_openclaw_secure/47_remote_cron_run_activity.txt`
- Remote session command evidence: `remote_openclaw_secure/37_remote_session_exec_events.tsv`
- Remote repo/workspace state: `remote_openclaw_secure/44_remote_repo_state.txt`, `45_remote_git_locations.txt`, `46_remote_workspace_repo_states.txt`

## Commands Run (This Analysis Pass)

```bash
pwd
ls -la
ls -la deploy/secure/docs
ls -la deploy/secure/docs/incident-36h-exec-evidence
ls -la deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z
ls -la deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure

sed -n '1,220p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/00_capture_meta.txt
sed -n '1,220p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/02_env_and_tool_visibility.txt
sed -n '1,260p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/10_config_snapshot_and_critical_keys.txt
sed -n '1,260p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/20_remote_host_env_tools.txt
sed -n '1,260p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/43_remote_critical_state_redacted.txt

sed -n '1,260p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/28_remote_config_audit_72h_events.tsv
sed -n '1,240p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/33_remote_config_audit_raw_tail_and_window.txt
sed -n '1,260p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/42_remote_gateway_runtime_focus.txt

rg -n "(openclaw config set|openclaw message send|gog |approval unavailable|approval pending|exec denied|No API key found|gateway.controlUi.root|pairing)" deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/37_remote_session_exec_events.tsv

sed -n '1,220p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/47_remote_cron_run_activity.txt
rg -n "(delivered|error|whatsapp|slack|gmail|calendar|drive|channel|rate|timeout|not configured|Channel is required)" deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/47_remote_cron_run_activity.txt

sed -n '1,260p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/25_remote_process_service_persistence.txt
sed -n '1,260p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/32_remote_logs_inventory_detailed.txt

sed -n '1,260p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/44_remote_repo_state.txt
sed -n '1,260p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/45_remote_git_locations.txt
sed -n '1,320p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/remote_openclaw_secure/46_remote_workspace_repo_states.txt

sed -n '1,260p' deploy/secure/docs/incident-36h-exec-evidence/20260331T032027Z/04_repo_state.txt
```

## Key Output Excerpts

### 1) Window and capture proof

From `00_capture_meta.txt`:

```text
captured_at_utc=2026-03-31T03:20:27Z
window_start_utc=2026-03-28T03:20:27Z
```

### 2) Tool visibility mismatch (local vs target runtime)

From local `02_env_and_tool_visibility.txt`:

```text
openclaw not found
gog not found
```

From remote `20_remote_host_env_tools.txt`:

```text
NODE_ENV=<unset>
OPENCLAW_ENV=<unset>
OPENCLAW_PROTECTED_CONFIG_ENFORCE=<unset>
PATH=/bin:/usr/bin:/sbin:/usr/sbin:/exe.dev/bin:/usr/local/bin
openclaw is /bin/openclaw
gog is /usr/local/bin/gog
```

### 3) Incident config write and subsequent risky exec toggles

From `28_remote_config_audit_72h_events.tsv`:

```text
2026-03-28T16:34:45.361Z ... openclaw config set gateway.controlUi.root /app/dist/control-ui
2026-03-28T19:12:33.031Z ... openclaw config set tools.exec.security deny
2026-03-28T19:12:41.054Z ... openclaw config set tools.exec.security full
2026-03-28T19:33:53.893Z ... openclaw config set tools.exec.ask always
2026-03-28T19:34:05.554Z ... openclaw config set tools.exec.ask off
2026-03-28T19:27:28.893Z ... openclaw config set env.shellEnv.enabled true
2026-03-28T19:31:01.428Z ... openclaw config set plugins.slots.contextEngine legacy
```

### 4) Current selected critical state (target runtime)

From `43_remote_critical_state_redacted.txt`:

```text
gateway_controlUi_root = /usr/lib/node_modules/openclaw/dist/control-ui
tools_exec_host = gateway
tools_exec_security = full
tools_exec_ask = on-miss
MISSING /root/.openclaw/agents/main/agent/auth-profiles.json
```

### 5) Pairing churn and access interruptions

From `42_remote_gateway_runtime_focus.txt`:

```text
pairing_required_count=2
pairing_approved_count=2
2026-03-31T00:08:52 ... reason=pairing required
2026-03-31T00:09:06 ... reason=pairing required
```

### 6) Auth/toolchain failure storm

From `42_remote_gateway_runtime_focus.txt`:

```text
api_key_missing_count=1202660
... No API key found for provider "groq" ... /root/.openclaw/agents/main/agent/auth-profiles.json
```

### 7) Workspace/Google read-path activity evidence

From `37_remote_session_exec_events.tsv`:

```text
gog gmail search ...
gog calendar events ...
gog docs info ...
gog contacts list ...
```

### 8) External comm attempts and cron behavior

From `37_remote_session_exec_events.tsv`:

```text
openclaw message send --channel slack --target @github --message "Hello @github, ..."
```

From `47_remote_cron_run_activity.txt`:

```text
status="error" error="Error: Outbound not configured for channel: whatsapp"
status="error" error="Channel is required (no configured channels detected)"
status="error" error="cron: job execution timed out"
```

### 9) Filesystem and repo state findings

From `44_remote_repo_state.txt` + `45_remote_git_locations.txt`:

```text
NO_REPO /root/openclaw
/root/.openclaw/workspace/.git
/root/.openclaw-recovery/workspace/.git
```

From `46_remote_workspace_repo_states.txt`:

```text
## No commits yet on master
(untracked/modified operational markdown and memory files)
```

### 10) Persistence and startup environment findings

From `25_remote_process_service_persistence.txt`:

```text
OPENCLAW_AUTH_ENV="$HOME/.openclaw/secure-mvp.env"
if [ -f "$OPENCLAW_AUTH_ENV" ]; then
  set -a
  . "$OPENCLAW_AUTH_ENV"
  set +a
fi
```

Also from same file:

```text
bash: line 1: systemctl: command not found
bash: line 1: crontab: command not found
bash: line 1: rg: command not found
```

(indicates collection limitations in that command path)

## External Action Evidence References

- Session-level command invocations: `remote_openclaw_secure/37_remote_session_exec_events.tsv`
- Cron run result payloads: `remote_openclaw_secure/47_remote_cron_run_activity.txt`
- Gateway key events for pairing/auth/policy: `remote_openclaw_secure/42_remote_gateway_runtime_focus.txt`, `39_remote_daily_gateway_key_events_limited.txt`

## Evidence Gaps

1. No provider-native audit exports were captured in this bundle:

- Slack Audit Logs/API event export
- Google Admin audit (Gmail/Drive/Calendar)
- GitHub org/repo audit events for the same window

2. Service manager and cron visibility on target host were partially limited in captured command path:

- `systemctl`/`crontab`/`rg` not available in the executed shell context of `25_remote_process_service_persistence.txt`.

3. Local machine logs and target runtime logs are both present; conclusions must be source-scoped.

- Local “gog missing” does not prove target-host absence.
- Target-host “gog present” does not prove local availability.

4. No direct exfiltration proof found in captured logs, but read access to Google Workspace data is directly evidenced via `gog` commands.
