# Control UI and Google Workspace Rollout Validation (Live Runtime)

Date (UTC): 2026-03-31
Repo commit under test: `2d91b829` (local main working tree)
Validation scope: Option 3 live validation only (no feature expansion)

## 1) Runtime Enforcement Findings

### Enforcement gate inputs observed in target runtime

Command output:

```bash
NODE_ENV=<unset>
OPENCLAW_ENV=<unset>
OPENCLAW_PROTECTED_CONFIG_ENFORCE=<unset>
OPENCLAW_CONTROL_UI_ROOT_ALLOWED_PREFIXES=<unset>
```

Code path deciding production policy mode:

- `src/config/protected-mutation.ts:147-158`
  - force-on if `OPENCLAW_PROTECTED_CONFIG_ENFORCE` is truthy
  - force-off if `OPENCLAW_PROTECTED_CONFIG_ENFORCE` is falsy
  - else true when `OPENCLAW_ENV in {prod,production}`
  - else true when `NODE_ENV=production`

Result:

- strict production approval gating is **not globally active by default in this shell runtime**
- protected validation is still active for invalid protected values (for example invalid Control UI root)
- strict direct-write denial is deterministic when explicitly enabled (`OPENCLAW_PROTECTED_CONFIG_ENFORCE=1`) or production env is set

## 2) Live Protected Config Negative Tests

### A/B) Exact incident-style bad write is rejected before activation, and active value remains unchanged

Command sequence and output:

```bash
=== BEFORE_GET ===
Config path not found: gateway.controlUi.root
BEFORE_GET_RC=1

=== BAD_SET_ATTEMPT ===
Error: gateway.controlUi.root candidate "/app/dist/control-ui" does not exist or is missing index.html. Build Control UI assets (`pnpm ui:build`) or set a valid root.
BAD_SET_RC=1

=== AFTER_GET ===
Config path not found: gateway.controlUi.root
AFTER_GET_RC=1
```

Observed behavior:

- mutation denied before activation
- active value remained unchanged (`gateway.controlUi.root` absent before and after)

### C) Protected-config enforcement path proven live (production policy mode)

Command sequence and output:

```bash
=== ENFORCE1_BEFORE_GATEWAY_BIND ===
Config path not found: gateway.bind
ENFORCE1_BEFORE_RC=1

=== ENFORCE1_SET_GATEWAY_BIND_ATTEMPT ===
Error: Protected config mutation denied for source "cli.config.set" in production mode. Use an approved admin apply path.
ENFORCE1_SET_RC=1

=== ENFORCE1_AFTER_GATEWAY_BIND ===
Config path not found: gateway.bind
ENFORCE1_AFTER_RC=1
```

Observed behavior:

- with `OPENCLAW_PROTECTED_CONFIG_ENFORCE=1`, direct protected write was denied
- target key remained unchanged after denied attempt

## 3) Audit Evidence

Audit sink: `~/.openclaw/logs/config-audit.jsonl`

Relevant raw records:

```json
{"ts":"2026-03-31T02:51:17.064Z","source":"config-io","event":"config.protectedMutation","configPath":"/Users/aurictechnology/.openclaw/openclaw.json","pid":22967,"ppid":22952,"cwd":"/Users/aurictechnology/openclaw","argv":["/opt/homebrew/Cellar/node@22/22.22.2/bin/node","/Users/aurictechnology/openclaw/openclaw.mjs","config","set","gateway.controlUi.root","/app/dist/control-ui"],"sourceTag":"cli.config.set","actor":"local-cli","requestId":null,"approvalContext":null,"approved":false,"productionMode":false,"result":"deny","reason":"gateway.controlUi.root candidate \"/app/dist/control-ui\" does not exist or is missing index.html. Build Control UI assets (`pnpm ui:build`) or set a valid root.","changes":[{"path":"gateway.controlUi.root","class":"control-ui-assets","previousValue":"<unset>","nextValue":"/app/dist/control-ui"}],"validationIssues":[{"path":"gateway.controlUi.root","code":"missing","message":"gateway.controlUi.root candidate \"/app/dist/control-ui\" does not exist or is missing index.html. Build Control UI assets (`pnpm ui:build`) or set a valid root."}]}
{"ts":"2026-03-31T02:52:09.162Z","source":"config-io","event":"config.protectedMutation","configPath":"/Users/aurictechnology/.openclaw/openclaw.json","pid":23839,"ppid":23838,"cwd":"/Users/aurictechnology/openclaw","argv":["/opt/homebrew/Cellar/node@22/22.22.2/bin/node","/Users/aurictechnology/openclaw/openclaw.mjs","config","set","gateway.bind","loopback"],"sourceTag":"cli.config.set","actor":"local-cli","requestId":null,"approvalContext":null,"approved":false,"productionMode":true,"result":"deny","reason":"Protected config mutation denied for source \"cli.config.set\" in production mode. Use an approved admin apply path.","changes":[{"path":"gateway.bind","class":"gateway-network","previousValue":"<unset>","nextValue":"loopback"}],"validationIssues":[]}
```

Fields present for operator auditability:

- event type: `config.protectedMutation`
- key/path via `changes[*].path`
- deny reason via `reason`
- actor/source via `actor` + `sourceTag`
- timestamp via `ts`
- request/correlation ID via `requestId` (nullable when not provided)

## 4) Control UI Validator Strength Check

Current validator is structural, not superficial:

- `src/config/protected-mutation.ts:173-243`
  - non-empty string check
  - path resolution + existence + `index.html`
  - readability check (`fs.accessSync` on root and index)
  - `assets/` exists and is directory
  - optional prefix allowlist enforcement via `OPENCLAW_CONTROL_UI_ROOT_ALLOWED_PREFIXES`

Conclusion: validator depth is sufficient for closure criteria; no additional code patch required for this phase.

## 5) Google Workspace Live Readiness Validation

### D) Explicit inspectable readiness and per-service state

Command: `pnpm openclaw webhooks gmail verify --json`

Raw output:

```json
{
  "state": "bootstrap_not_run",
  "message": "Google Workspace bootstrap missing: gog binary not found on PATH.",
  "connectorEnabled": true,
  "account": null,
  "checkedAt": "2026-03-31T02:52:44.049Z",
  "services": {
    "gmail": {
      "service": "gmail",
      "state": "bootstrap_not_run",
      "message": "Google Workspace bootstrap missing: gog binary not found on PATH.",
      "missingPrerequisite": "Install gogcli and ensure `gog` is available on PATH before running Workspace deltas.",
      "deltaProbeCommand": null,
      "deltaProbeExitCode": null,
      "deltaCount": null,
      "stdoutPreview": null,
      "stderrPreview": null
    },
    "calendar": {
      "service": "calendar",
      "state": "bootstrap_not_run",
      "message": "Google Workspace bootstrap missing: gog binary not found on PATH.",
      "missingPrerequisite": "Install gogcli and ensure `gog` is available on PATH before running Workspace deltas.",
      "deltaProbeCommand": null,
      "deltaProbeExitCode": null,
      "deltaCount": null,
      "stdoutPreview": null,
      "stderrPreview": null
    },
    "drive": {
      "service": "drive",
      "state": "bootstrap_not_run",
      "message": "Google Workspace bootstrap missing: gog binary not found on PATH.",
      "missingPrerequisite": "Install gogcli and ensure `gog` is available on PATH before running Workspace deltas.",
      "deltaProbeCommand": null,
      "deltaProbeExitCode": null,
      "deltaCount": null,
      "stdoutPreview": null,
      "stderrPreview": null
    }
  }
}
```

Command: `pnpm openclaw status --all`

Relevant raw lines:

```text
│ Google Workspace │ bootstrap_not_run · account:auto                                                                  │
...
! Google Workspace: bootstrap_not_run
  Google Workspace bootstrap missing: gog binary not found on PATH.
  - gmail: bootstrap_not_run · Google Workspace bootstrap missing: gog binary not found on PATH.
    next: Install gogcli and ensure `gog` is available on PATH before running Workspace deltas.
  - calendar: bootstrap_not_run · Google Workspace bootstrap missing: gog binary not found on PATH.
    next: Install gogcli and ensure `gog` is available on PATH before running Workspace deltas.
  - drive: bootstrap_not_run · Google Workspace bootstrap missing: gog binary not found on PATH.
    next: Install gogcli and ensure `gog` is available on PATH before running Workspace deltas.
```

Additional prerequisite proof:

```bash
gog not found
WHICH_GOG_RC=1
```

### E/F) Real probe-path validation status

Implementation evidence for real read-only probes when bootstrap/auth are present:

- `src/hooks/google-workspace-readiness.ts:276-300`
  - Gmail probe: `gog gmail search newer_than:1d --max 10`
  - Calendar probe: `gog calendar events primary --from ... --to ...`
  - Drive probe: `gog drive search "modifiedTime > '<iso>'" --max 10`
- `src/hooks/google-workspace-readiness.ts:396-451`
  - auth preflight probe: `gog auth list --json`
- `src/hooks/google-workspace-readiness.ts:453-475`
  - executes Gmail/Calendar/Drive probes in parallel when preflight passes

Live runtime result in this session:

- blocker reached at bootstrap gate (`gog` missing), so active delta probes could not execute live from this host in this run
- classification is explicit and operator-actionable (`bootstrap_not_run` + exact next step)

## 6) Acceptance Checklist (Live Validation Run)

- [x] target runtime enforcement conditions are identified and documented
- [x] protected mutation enforcement is proven active in runtime path (`OPENCLAW_PROTECTED_CONFIG_ENFORCE=1` proof)
- [x] exact bad controlUi path write is rejected before activation
- [x] active config remains unchanged after failed write
- [x] denied mutation is audited with usable evidence
- [x] validator is strong enough to justify closure claim
- [x] Workspace readiness output is explicit, not vague
- [x] operator can see exact missing prerequisite when not ready
- [ ] when credentials/scopes are valid, real read-only probe/delta path is exercised (blocked in this runtime by missing `gog` bootstrap)
- [x] evidence includes concrete command outputs

Phase-close status: **NOT CLOSED** (one external runtime prerequisite still missing).

## 7) Exact Remaining Manual Steps

1. Install `gog` on the target runtime and ensure it resolves on PATH for the OpenClaw execution context.
2. Bootstrap auth/scopes:
   - `gog auth credentials <client_secret.json>`
   - `gog auth add <account> --services gmail,calendar,drive`
3. Re-run live verification:
   - `openclaw webhooks gmail verify --json`
   - `openclaw status --all`
4. Confirm pass criteria in output:
   - overall `state: configured_and_verified`
   - `services.gmail|calendar|drive.state = configured_and_verified`
   - each service includes non-null `deltaProbeCommand`, exit code `0`, and `deltaCount`.
