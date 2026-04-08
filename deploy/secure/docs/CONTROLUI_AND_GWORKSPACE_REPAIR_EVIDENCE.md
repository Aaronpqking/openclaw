# Control UI and Google Workspace Repair Evidence

## Live Rollout Validation Addendum

For runtime proof on a live host/session (negative protected-write test, audit evidence, and Google readiness probe output), see:

- `deploy/secure/docs/CONTROLUI_AND_GWORKSPACE_ROLLOUT_VALIDATION.md`

## File-by-File Change List

- `src/config/protected-mutation.ts`
  - added protected key registry and class mapping
  - added production-mode enforcement predicate
  - added host-aware `gateway.controlUi.root` validation (existence/readability/`index.html`/`assets`/allowed-prefix)
  - added protected mutation decision model (allow/deny + reason + validation issues)
- `src/config/io.ts`
  - added `ConfigWriteOptions.protectedMutation`
  - inserted protected mutation candidate validation before persistence
  - added `config.protectedMutation` audit event records (allow and deny)
  - ensured denied candidate throws before file commit
- `src/cli/config-cli.ts`
  - tagged `runConfigSet` / `runConfigUnset` writes with direct unapproved protected-mutation source metadata
- `src/gateway/server-methods/config.ts`
  - tagged `config.set` writes as unapproved direct mutation source
  - tagged `config.patch` / `config.apply` as approved admin apply path with approval context
- `src/hooks/google-workspace-readiness.ts`
  - added explicit readiness-state classifier for Gmail/Calendar/Drive
  - added read-only delta probes for all three services
  - added deterministic aggregate state computation and per-service prerequisites
- `src/hooks/google-workspace-readiness.test.ts`
  - added focused verification-state and delta-path tests
- `src/cli/webhooks-cli.ts`
  - added `openclaw webhooks gmail verify` operator command (human + JSON output)
- `src/commands/status-all.ts`
  - added Google Workspace readiness probe integration in `status --all`
- `src/commands/status-all/diagnosis.ts`
  - added explicit Google Workspace diagnosis section with per-service state and actionable next step
- `src/config/io.write-config.test.ts`
  - added focused protected-key mutation tests (deny/allow/reject-invalid/audit)

## Test Commands and Results

### Command

```bash
pnpm test -- src/config/io.write-config.test.ts src/gateway/server.config-patch.test.ts src/hooks/google-workspace-readiness.test.ts src/commands/status-all/report-lines.test.ts
```

### Result

- `src/config/io.write-config.test.ts`: passed
- `src/gateway/server.config-patch.test.ts`: passed
- `src/hooks/google-workspace-readiness.test.ts`: passed
- `src/commands/status-all/report-lines.test.ts`: passed

Summary from run:

- unit lane: 26 passed
- base lane: 1 passed
- gateway lane: 12 passed

### Build Validation

```bash
pnpm build
```

Result: passed.

## Before / After Behavior Notes

### Incident A (Control UI root mutation)

Before:

- `gateway.controlUi.root` could be written via generic config mutation paths with only schema validation.
- non-existent paths could persist and become active-attempted runtime config.

After:

- protected mutations are evaluated before commit.
- invalid `gateway.controlUi.root` candidates are denied before activation.
- production direct mutation sources require approved apply path metadata.
- allow/deny attempts are audited to `~/.openclaw/logs/config-audit.jsonl` as `config.protectedMutation`.

### Incident B (Google Workspace readiness)

Before:

- no deterministic runtime readiness model for Gmail/Calendar/Drive with explicit failure classes.
- operational feedback could degrade into vague "not verified" outcomes.

After:

- readiness classification is explicit with nine states.
- per-service Gmail/Calendar/Drive probe results include state, message, and exact missing prerequisite.
- operator can inspect via:
  - `openclaw webhooks gmail verify`
  - `openclaw webhooks gmail verify --json`
  - `openclaw status --all`

## Proof: Invalid `gateway.controlUi.root` No Longer Becomes Live

Automated proof in `src/config/io.write-config.test.ts`:

- `denies protected direct writes without approval in production mode`
- `accepts a validated protected write when approval context is present`
- `rejects invalid gateway.controlUi.root candidates and keeps active config unchanged`
- `audits both allowed and denied protected mutation attempts`

These tests assert:

- deny path triggers before commit for unapproved direct writes
- invalid candidate throws with structural-path reason
- persisted config remains at prior known-good value after rejection
- audit log captures both deny and allow records

## Proof: Google Workspace Readiness Inspectable + Verified Delta Path

Automated proof in `src/hooks/google-workspace-readiness.test.ts`:

- `classifies connector_disabled when gog skill entry is disabled`
- `classifies bootstrap_not_run when gog binary is unavailable`
- `classifies missing credentials from auth bootstrap failure`
- `classifies missing scopes from service delta probe`
- `runs gmail/calendar/drive delta probes when verified`
- `classifies expired/invalid token errors explicitly`

These tests assert:

- explicit state mapping for disabled/bootstrap/auth/scope/token failures
- verified state only when all three service probes succeed
- delta probes execute for Gmail, Calendar, and Drive
- diagnostics avoid vague generic readiness language and include explicit prerequisite text

## Operator Reproduction Steps

1. Attempt protected direct write in production policy mode:

```bash
OPENCLAW_PROTECTED_CONFIG_ENFORCE=1 openclaw config set gateway.controlUi.root /app/dist/control-ui
```

Expected: denied with protected mutation reason (or validation failure if path invalid).

2. Inspect protected mutation audit records:

```bash
tail -n 50 ~/.openclaw/logs/config-audit.jsonl
```

Expected: `event:"config.protectedMutation"` entries with `result:"allow"|"deny"`, reason, source, actor context.

3. Inspect Google Workspace readiness:

```bash
openclaw webhooks gmail verify --json
openclaw status --all
```

Expected: explicit overall + per-service states and exact missing prerequisite when not ready.
