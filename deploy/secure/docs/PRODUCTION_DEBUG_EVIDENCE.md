# Production Debug Evidence

## Exact commands run

```bash
git status --short
sed -n '1,220p' .github/CODEOWNERS
sed -n '1,220p' .agents/skills/openclaw-pr-maintainer/SKILL.md
git diff -- src/auto-reply/reply/dispatch-from-config.test.ts src/auto-reply/reply/get-reply-run.ts src/auto-reply/reply/commands-approve.ts src/auto-reply/reply/agent-runner-utils.ts src/cron/isolated-agent/delivery-target.ts src/cron/isolated-agent/delivery-target.test.ts
sed -n '1,260p' src/auto-reply/reply/get-reply-run.ts
sed -n '1,260p' src/cron/isolated-agent/delivery-target.ts
sed -n '1,260p' deploy/secure/docs/WHATSAPP_RECOVERY_RUNBOOK.md
git log --grep='whatsapp\|slack\|approval\|model\|calendar\|routing\|delivery' --oneline --decorate -n 80
sed -n '1,260p' src/auto-reply/reply/dispatch-from-config.ts
sed -n '1,260p' extensions/slack/src/monitor/message-handler/prepare.ts
sed -n '1,260p' src/auto-reply/reply/agent-runner-execution.ts
sed -n '1,260p' extensions/whatsapp/src/auto-reply/monitor/on-message.ts
sed -n '1,620p' extensions/whatsapp/src/auto-reply/monitor/process-message.ts
sed -n '1,260p' extensions/slack/src/token.ts
sed -n '1,620p' extensions/slack/src/monitor/provider.ts
sed -n '1,260p' extensions/slack/src/monitor/replies.ts
sed -n '1,260p' extensions/slack/src/accounts.ts
sed -n '1,240p' src/auto-reply/reply/reply-dispatcher.ts
sed -n '1,260p' src/infra/agent-events.ts
sed -n '340,760p' src/auto-reply/reply/agent-runner.ts
sed -n '1,220p' Dockerfile
sed -n '1,200p' deploy/secure/docker-compose.secure.yml
sed -n '1,80p' deploy/secure/docker-compose.v1_1.yml
sed -n '1,220p' deploy/secure/openclaw/eleanor-slack.fragment.json
sed -n '1,220p' deploy/secure/docs/RUNTIME_CAPABILITY_AUDIT.md
sed -n '1,220p' deploy/secure/docs/OPERATOR_DEBUG_COMMANDS.md
docker compose -f deploy/secure/docker-compose.secure.yml config >/tmp/openclaw-secure-compose-config.txt && echo OK
pnpm test -- src/cron/isolated-agent/delivery-target.test.ts
pnpm test -- src/auto-reply/reply/commands.test.ts -t "/approve command"
pnpm test -- src/auto-reply/reply/agent-runner.model-selection.test.ts src/cron/isolated-agent/delivery-target.test.ts src/auto-reply/reply/dispatch-from-config.test.ts src/auto-reply/reply/get-reply-run.media-only.test.ts
docker image inspect openclaw:secure-mvp --format '{{.Size}}' 2>/dev/null || true
docker images openclaw:secure-mvp --format '{{.Repository}}:{{.Tag}} {{.Size}}' 2>/dev/null || true
git diff --stat -- deploy/secure/docker-compose.secure.yml src/auto-reply/reply/agent-runner.ts src/auto-reply/reply/agent-runner.model-selection.test.ts src/cron/isolated-agent/delivery-target.ts src/cron/isolated-agent/delivery-target.test.ts src/auto-reply/reply/get-reply-run.ts src/auto-reply/reply/agent-runner-utils.ts src/auto-reply/reply/commands-approve.ts src/auto-reply/reply/dispatch-from-config.test.ts
git status --short -- deploy/secure/docker-compose.secure.yml src/auto-reply/reply/agent-runner.ts src/auto-reply/reply/agent-runner.model-selection.test.ts src/cron/isolated-agent/delivery-target.ts src/cron/isolated-agent/delivery-target.test.ts src/auto-reply/reply/get-reply-run.ts src/auto-reply/reply/agent-runner-utils.ts src/auto-reply/reply/commands-approve.ts src/auto-reply/reply/dispatch-from-config.test.ts
```

## Files inspected

```text
.github/CODEOWNERS
.agents/skills/openclaw-pr-maintainer/SKILL.md
Dockerfile
deploy/secure/docker-compose.secure.yml
deploy/secure/docker-compose.v1_1.yml
deploy/secure/docs/WHATSAPP_RECOVERY_RUNBOOK.md
deploy/secure/docs/RUNTIME_CAPABILITY_AUDIT.md
deploy/secure/docs/OPERATOR_DEBUG_COMMANDS.md
deploy/secure/openclaw/eleanor-slack.fragment.json
extensions/slack/src/accounts.ts
extensions/slack/src/monitor/message-handler/prepare.ts
extensions/slack/src/monitor/provider.ts
extensions/slack/src/monitor/replies.ts
extensions/slack/src/token.ts
extensions/whatsapp/src/auto-reply/monitor/echo.ts
extensions/whatsapp/src/auto-reply/monitor/on-message.ts
extensions/whatsapp/src/auto-reply/monitor/process-message.ts
src/auto-reply/reply/agent-runner-execution.ts
src/auto-reply/reply/agent-runner.ts
src/auto-reply/reply/agent-runner-utils.ts
src/auto-reply/reply/commands-approve.ts
src/auto-reply/reply/dispatch-from-config.ts
src/auto-reply/reply/dispatch-from-config.test.ts
src/auto-reply/reply/get-reply-run.ts
src/auto-reply/reply/reply-dispatcher.ts
src/cron/isolated-agent/delivery-target.ts
src/cron/isolated-agent/delivery-target.test.ts
src/infra/agent-events.ts
```

## Files changed in this turn

```text
deploy/secure/docker-compose.secure.yml
src/auto-reply/reply/agent-runner.ts
src/auto-reply/reply/agent-runner.model-selection.test.ts
src/cron/isolated-agent/delivery-target.test.ts
```

## Existing local files validated but not originated in this turn

```text
src/auto-reply/reply/agent-runner-utils.ts
src/auto-reply/reply/commands-approve.ts
src/auto-reply/reply/dispatch-from-config.test.ts
src/auto-reply/reply/get-reply-run.ts
src/cron/isolated-agent/delivery-target.ts
```

## Before / after observations

### Secure deploy target

Before:

- `deploy/secure/docker-compose.secure.yml` explicitly built `target: secure-runtime-assets`
- `Dockerfile` applies optional `gog` installation only in the final runtime stage
- result: secure compose could not honor runtime `gog` installation even if build args were set

After:

- secure compose no longer forces the intermediate target
- `docker compose -f deploy/secure/docker-compose.secure.yml config` succeeds
- secure deploy now uses the final runtime stage where optional installs and lean runtime packaging actually apply

### Model selection evidence

Before:

- fallback machinery existed, but there was no guaranteed operator-readable lifecycle event containing requested model, resolved model, final model, and reason codes

After:

- `src/auto-reply/reply/agent-runner.ts` emits a `model_selection` lifecycle event with:
  - requested provider/model
  - resolved/final provider/model
  - fallback-applied / fallback-cleared flags
  - attempt summaries
  - compact reason codes

### Cron routing contract

Before:

- no explicit recipient plus no previous session route could still fall through into channel selection
- this weakened the contract that cron Slack jobs must have explicit recipients

After:

- unresolved cron recipients fail with:

```text
No associated delivery recipient resolved. Set delivery.to (and optionally delivery.channel), or reuse a session with a previous channel and recipient.
```

## Relevant trimmed logs and outputs

### Secure compose validation

```text
$ docker compose -f deploy/secure/docker-compose.secure.yml config >/tmp/openclaw-secure-compose-config.txt && echo OK
OK
```

### Targeted validation suite

```text
$ pnpm test -- src/auto-reply/reply/agent-runner.model-selection.test.ts src/cron/isolated-agent/delivery-target.test.ts src/auto-reply/reply/dispatch-from-config.test.ts src/auto-reply/reply/get-reply-run.media-only.test.ts
Test Files  4 passed
Tests       87 passed
```

```text
$ pnpm test -- src/auto-reply/reply/commands.test.ts -t "/approve command"
Test Files  1 passed
Tests       6 passed | 46 skipped
```

### Unrelated broad-test failure not pursued

```text
$ pnpm test -- src/auto-reply/reply/commands.test.ts
FAIL  src/auto-reply/reply/commands.test.ts > handleCommands subagents > blocks leaf subagents from sending to explicitly-owned child sessions
Error: Test timed out in 120000ms.
```

This timeout was outside the `/approve` production fix path and was not broadened into a separate repair.

### Build-footprint measurability

```text
$ docker image inspect openclaw:secure-mvp --format '{{.Size}}'
(no local image present)
```

```text
$ docker images openclaw:secure-mvp --format '{{.Repository}}:{{.Tag}} {{.Size}}'
(no local image present)
```

So actual local image size was not measurable in this workspace.
