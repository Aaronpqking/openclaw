# INCIDENT_36H_EXEC_DAMAGE_REPORT

## Executive Summary

OpenClaw ran with broad execution capability during the analyzed period and experienced multiple high-impact integrity/availability events: an invalid `gateway.controlUi.root` write, repeated high-risk `tools.exec.*` policy toggles, pairing churn, and sustained model-auth failures tied to a missing agent auth profile file. The evidence confirms real Google Workspace read-path command execution (`gog gmail/calendar/docs/contacts`) and at least one explicit Slack send attempt command. The current evidence does not fully prove provider-side message delivery or secret exfiltration, but confidentiality risk is non-trivial and trust is reduced across runtime config, agent auth state, and automation surfaces.

## What Is Confirmed

1. A bad control UI path write occurred:

- `gateway.controlUi.root=/app/dist/control-ui` at `2026-03-28T16:34:45.361Z`.

2. Risky exec-policy mutation happened repeatedly:

- `tools.exec.security` toggled between `deny` and `full`.
- `tools.exec.ask` toggled between `off`, `always`, and `off`.
- `tools.exec.host=gateway` repeatedly re-applied.

3. Runtime/tool visibility mismatch existed by host context:

- Local machine: `gog` not found.
- Target runtime: `gog` present at `/usr/local/bin/gog`.

4. Pairing instability occurred:

- Pairing approvals and pairing-required connection failures were both recorded in the same window.

5. Google Workspace read commands were executed in session runtime:

- `gog gmail search`, `gog calendar events`, `gog docs info`, `gog contacts list`.

6. Agent auth state was broken in target runtime:

- Repeated `No API key found ... /root/.openclaw/agents/main/agent/auth-profiles.json`.
- `auth-profiles.json` was missing in sampled runtime state.

7. Cron repeatedly attempted outbound behavior with failures:

- Errors include `Channel is required` and `Outbound not configured for channel: whatsapp`.

## What Is Disproven

1. “`gog` was fully missing on SVM” is disproven for the sampled runtime:

- `gog` exists at `/usr/local/bin/gog` in remote environment capture.

2. “All disconnects were code 1006” is not supported in sampled gateway focus logs:

- Captured pairing failures were code `1008` (`pairing required`); sampled `disconnect_1006_count=0`.

## What Is Still Unknown

1. Whether external provider-side deliveries actually occurred (Slack/WhatsApp/Gmail sends) in this exact window.

- Local logs show attempts and internal delivery states, but no provider audit export is present.

2. Whether secrets/tokens were exfiltrated.

- No direct exfil proof in logs; capability and exposure window justify caution.

3. Exact human/operator attribution for every mutation.

- Process/argv/cwd are present; person-level attribution is incomplete.

## Damage Assessment By Surface

### Surface A: Config damage

- Confirmed changed keys in incident window:
  - `gateway.controlUi.root`
  - `tools.exec.host`
  - `tools.exec.security`
  - `tools.exec.ask`
  - `env.shellEnv.enabled`
  - `plugins.slots.contextEngine`
- Impact:
  - Availability: UI break risk and gateway behavior drift.
  - Integrity: exec policy/security posture changed repeatedly.
- Assessment: `High` integrity risk.

### Surface B: Filesystem/repo damage

- Remote canonical repo path `/root/openclaw` was absent; runtime used workspace git dirs under `~/.openclaw/` with no commits and many untracked operational files.
- Local repo is heavily dirty/diverged (not automatically attributable to this remote incident).
- No direct evidence of binary replacement in sampled PATH locations.
- Assessment: `Medium` integrity risk, `High` uncertainty.

### Surface C: External action damage

- Confirmed:
  - Workspace data read commands executed.
  - Slack send command attempted.
  - WhatsApp outbound cron attempts occurred, several with explicit delivery-configuration failures.
- Not confirmed:
  - Provider-side final deliveries for all attempts.
- Assessment: `Medium-High` confidentiality risk; `Medium` external-comms integrity risk.

### Surface D: Credential/auth damage

- Target runtime loaded `.openclaw/secure-mvp.env` via shell profile.
- Agent auth profile file missing (`auth-profiles.json`), causing repeated model auth failures.
- Key-name presence confirms sensitive env scope exists (names redacted in evidence; values not exposed in docs).
- Assessment: `High` operational auth risk, `Medium-High` credential exposure concern.

### Surface E: Persistence/recurring automation

- Cron run artifacts show recurring autonomous executions with mixed success/failure.
- Evidence of repeated generated summaries, including content marked as simulated/inferred in some outputs.
- Service-manager visibility was partially constrained by command availability during collection.
- Assessment: `High` trust risk for unattended automation outputs until re-verified.

## Trust Classification

| Surface / Object                                                 | Classification               | Rationale                                                                                 |
| ---------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| Runtime config (`/root/.openclaw/openclaw.json`)                 | 4. Untrusted                 | High-risk key churn and known bad UI-path incident write.                                 |
| Protected config keys (`gateway.controlUi.root`, `tools.exec.*`) | 4. Untrusted                 | Confirmed unsafe/volatile mutations in incident window.                                   |
| Repo working tree (local dev machine)                            | 3. Reviewed, uncertain       | Heavily dirty/diverged; not directly attributable to remote runtime incident.             |
| Deploy scripts/runtime wrappers (remote shell/profile path)      | 3. Reviewed, uncertain       | `.profile` env sourcing active; incomplete service-manager visibility.                    |
| Service env                                                      | 4. Untrusted                 | Sensitive env auto-loaded plus missing auth profile and auth storms.                      |
| Shell bootstrap files                                            | 3. Reviewed, uncertain       | Remote `.profile` modified and actively sourcing secure env file.                         |
| Connector auth state                                             | 5. Requires rebuild/rotation | Missing `auth-profiles.json`; sustained auth failures.                                    |
| Outbound channel configuration                                   | 3. Reviewed, uncertain       | Channels enabled, but cron shows repeated outbound misconfiguration failures.             |
| Google Workspace integration state                               | 4. Untrusted                 | Read-path commands executed, but verification/auth state inconsistent by runtime context. |
| `gog` tool visibility                                            | 2. Reviewed, low risk        | Present on target host; mismatch explained by host-context PATH differences.              |
| Scheduled jobs/automations                                       | 4. Untrusted                 | Recurrent unattended runs with mixed reliability and synthetic/inferred content.          |

## Key Anomalies and Hypotheses

### 1) Bad `gateway.controlUi.root` write

- Observed fact:
  - Invalid path `/app/dist/control-ui` was written live.
- Most likely explanation:
  - Unsafe config mutation path allowed a non-validated protected key write in that runtime/version.
- Counter-hypothesis:
  - Path existed transiently in another container/host context and later disappeared.
- Supporting evidence:
  - Config audit write event plus user-observed Control UI asset failure.
- Unresolved:
  - Exact approval/control path that allowed this write at that timestamp.

### 2) “gog missing” despite prior belief it was installed

- Observed fact:
  - Local runtime: `gog` missing; target host runtime: `gog` present.
- Most likely explanation:
  - Context mismatch (different hosts/PATHs/services), not necessarily uninstall.
- Counter-hypothesis:
  - Intermittent PATH or wrapper drift inside service startup context.
- Supporting evidence:
  - `02_env_and_tool_visibility.txt` vs `20_remote_host_env_tools.txt`.
- Unresolved:
  - Full service-unit environment (systemd not available in sampled path).

### 3) Repeated device re-pair requirements

- Observed fact:
  - Pairing approvals and pairing-required rejects happened close together.
- Most likely explanation:
  - Device-token rotation/invalidation or changed pairing store state.
- Counter-hypothesis:
  - Multiple devices with mixed trust states and stale tokens reconnecting.
- Supporting evidence:
  - Gateway pairing logs + paired device record churn and mtimes.
- Unresolved:
  - Exact initiating action that invalidated prior pairings.

### 4) Model/auth failures (`auth-profiles.json` missing)

- Observed fact:
  - Continuous fallback failures cite missing auth profile file.
- Most likely explanation:
  - Agent auth bootstrap/profile copy step was skipped, removed, or corrupted.
- Counter-hypothesis:
  - Permissions/path mapping bug referencing wrong directory.
- Supporting evidence:
  - Gateway diagnostic errors + critical state file check.
- Unresolved:
  - File loss mechanism (manual deletion vs migration bug vs startup bug).

### 5) Potential external messaging activity vs evidence quality

- Observed fact:
  - Slack send and WhatsApp cron outbound attempts are present; many outbound errors logged.
- Most likely explanation:
  - Automation attempted egress but frequently failed due channel binding/config state.
- Counter-hypothesis:
  - Some outbound deliveries succeeded but are only represented in provider logs not captured here.
- Supporting evidence:
  - Session exec + cron run artifacts + lack of explicit provider-side proof in current set.
- Unresolved:
  - Final provider-confirmed delivery inventory for the window.

## Immediate Recommended Containment (Do Not Auto-Execute In This Report)

1. Freeze unattended cron/automation egress temporarily.
2. Snapshot and seal forensic copies of:

- `~/.openclaw/logs/`
- `~/.openclaw/agents/`
- `~/.openclaw/devices/`
- `~/.openclaw/cron/`
- active config files (`/root/.openclaw/openclaw.json`, legacy `/home/node/.openclaw/openclaw.json` if present).

3. Force operator re-pair policy with explicit approval review.
4. Gate protected config mutation to approved-only path in production runtime.

## Recommended Remediation Order

1. Evidence seal and outbound freeze.
2. Rebuild trusted auth state:

- regenerate agent auth profiles, verify model/provider auth end-to-end.

3. Rotate high-value secrets/tokens in scope.
4. Rebuild runtime config from known-good baseline and re-apply only audited diffs.
5. Re-enable automations gradually with per-job explicit channel binding and dry-run checks.
6. Run provider-side audit reconciliation (Slack/Google/GitHub) against this timeline.

## Recommended Secret/Token Rotation Scope

- Rotate at minimum:
  - OpenAI/Groq/Google model API keys used by runtime.
  - Slack bot/app tokens.
  - Gateway auth token/password.
  - Any token references in `secure-mvp.env` and connector credential stores.
- Reason: prolonged broad-exec window + missing auth profile file + uncertain exposure boundary.

## Recommended Rebuild Scope

- Rebuild required for:
  - agent auth profile state,
  - runtime config baseline,
  - pairing trust baseline,
  - cron delivery bindings.
- Optional but strongly recommended:
  - clean-room reprovision of runtime host profile/env wiring.
