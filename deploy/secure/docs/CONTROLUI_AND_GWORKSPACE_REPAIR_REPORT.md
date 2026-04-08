# Control UI and Google Workspace Repair Report

## Executive Summary

This repair implements two production-safety fixes in one branch:

1. hardened protected config mutation for critical keys, including `gateway.controlUi.root`, with pre-activation validation and audit records
2. added deterministic Google Workspace readiness verification with explicit state classification and read-only Gmail/Calendar/Drive delta probes

The config path that previously allowed an unsafe `gateway.controlUi.root` write now rejects invalid candidates before activation and records allow/deny outcomes in audit logs.

Google Workspace readiness is now explicitly inspectable with service-level states and prerequisites via:

- `openclaw webhooks gmail verify`
- `openclaw status --all` diagnosis output

## Live Rollout Validation Addendum

Live runtime validation evidence for phase-close gating is captured in:

- `deploy/secure/docs/CONTROLUI_AND_GWORKSPACE_ROLLOUT_VALIDATION.md`

## Root Cause: Incident A (Bad Control UI Path Write)

- Critical config writes were validated only against schema shape, not host/runtime safety.
- `gateway.controlUi.root` could be persisted with a non-existent or structurally invalid path.
- Generic mutation paths (`config set` / `config.set`) had no production approval gate for protected keys.

## Root Cause: Incident B (Google Workspace Verification Failure)

- No deterministic readiness model existed for Gmail/Calendar/Drive in runtime diagnostics.
- Failures collapsed into coarse operational outcomes (for example startup/watch failures) without explicit prerequisite classes.
- No single operator-visible health surface provided per-service readiness + next-step remediation.

## Code Paths Changed

- `src/config/protected-mutation.ts`
  - new protected-key model, production gate policy, host-aware `gateway.controlUi.root` validation, and mutation decision/audit data model
- `src/config/io.ts`
  - wired protected mutation evaluation into write path (candidate -> validate -> commit)
  - added `config.protectedMutation` audit event (allow/deny + reason + actor/source + old/new summaries)
  - preserved fail-closed behavior (throw before persistence on deny/validation failure)
- `src/cli/config-cli.ts`
  - tagged `config set` / `config unset` writes as unapproved protected mutation sources
- `src/gateway/server-methods/config.ts`
  - tagged `config.set` as unapproved direct mutation source
  - tagged `config.apply` / `config.patch` as approved admin apply sources
- `src/hooks/google-workspace-readiness.ts`
  - new deterministic readiness engine for Gmail/Calendar/Drive
  - explicit states:
    - `configured_and_verified`
    - `configured_but_unverified`
    - `missing_credentials`
    - `missing_required_scopes`
    - `token_invalid_or_expired`
    - `connector_disabled`
    - `bootstrap_not_run`
    - `provider_api_error`
    - `unknown_internal_error`
  - read-only delta probes for Gmail/Calendar/Drive
- `src/cli/webhooks-cli.ts`
  - added `openclaw webhooks gmail verify` operator command
- `src/commands/status-all.ts`
  - integrated Google Workspace readiness probe into `status --all`
- `src/commands/status-all/diagnosis.ts`
  - added explicit Google Workspace diagnosis lines with per-service state + required next step

## Behavior Changes (Blocked vs Allowed)

### Blocked

- In production policy mode, unapproved protected writes from direct mutation paths are denied:
  - `cli.config.set`
  - `cli.config.unset`
  - `gateway.config.set`
- `gateway.controlUi.root` candidate values are denied when:
  - path missing
  - unreadable
  - missing `index.html`
  - missing `assets/`
  - outside `OPENCLAW_CONTROL_UI_ROOT_ALLOWED_PREFIXES` (when set)

### Allowed

- Protected writes through approved admin apply paths are allowed:
  - `gateway.config.apply`
  - `gateway.config.patch`
- Non-protected writes continue unchanged.
- Google Workspace delta probes execute when connector + auth/scopes are valid.

## Operator Manual Steps (Unavoidable External Prerequisites)

For Google Workspace auth bootstrap (external OAuth precondition):

1. `gog auth credentials <client_secret.json>`
2. `gog auth add <account> --services gmail,calendar,drive`
3. Verify state:
   - `openclaw webhooks gmail verify --json`
   - `openclaw status --all`

## Remaining Risks / Deferred Items

- Gateway integration tests use mocked config IO in this repo harness; enforcement is validated directly in config IO tests and wired in gateway handlers, but gateway e2e denial is not asserted by that mocked suite.
- Existing legacy write call sites without explicit source context are still audited when protected keys change, but production approval enforcement is currently targeted to explicit direct mutation sources listed above.

## Acceptance Checklist

- [x] bad `gateway.controlUi.root` candidate is rejected before activation
- [x] unsafe direct protected writes are blocked in production policy mode
- [x] active config remains unchanged after protected-write rejection
- [x] protected allow/deny attempts are audited with reason and context
- [x] focused tests cover protected mutation path
- [x] runtime distinguishes explicit Google Workspace readiness states
- [x] diagnostics now report explicit classifications instead of vague readiness failure
- [x] verified readiness path executes Gmail/Calendar/Drive delta probes
- [x] incomplete config/auth surfaces exact missing prerequisite
- [x] focused tests cover classification and verified delta path
- [x] operator-visible inspection paths exist (`status --all`, `webhooks gmail verify`, config audit log)
