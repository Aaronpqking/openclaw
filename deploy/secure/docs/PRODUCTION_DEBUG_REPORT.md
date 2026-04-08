# Production Debug Report

## Executive summary

OpenClaw production reliability was being undermined by two different classes of problems:

1. a real secure-deploy divergence in `deploy/secure/docker-compose.secure.yml` that built from the intermediate `secure-runtime-assets` stage instead of the final runtime stage, which bypassed optional runtime installs like `gog` and made low-footprint build args misleading in production
2. missing or weak evidence on key runtime decisions, especially model resolution/fallback and cron recipient selection

This turn applied the smallest new production fix in code and deploy config:

- removed the secure compose `target: secure-runtime-assets` override so secure production builds use the final runtime stage again
- added a lightweight `model_selection` lifecycle audit event in `src/auto-reply/reply/agent-runner.ts`

This turn also validated already-present local fixes on the exact production symptoms:

- `src/auto-reply/reply/get-reply-run.ts` and `src/auto-reply/reply/agent-runner-utils.ts` now keep explicit-target enforcement limited to internal webchat turns that were intentionally promoted into external delivery
- `src/cron/isolated-agent/delivery-target.ts` now fails clearly when cron delivery has no explicit recipient and no prior session route, instead of silently guessing a channel
- `src/auto-reply/reply/commands-approve.ts` now normalizes wrapped approval ids and gives actionable expired-id guidance
- `src/auto-reply/reply/dispatch-from-config.ts` already suppresses verifier-origin reply loops and only escalates ambiguity to the configured WhatsApp operator target

## Symptom table

| Symptom                                                       | Current assessment                                                                                                                                       | Evidence                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calendar auth succeeded but no trustworthy calendar E2E proof | Unproven live path; likely blocked in secure deploys that rely on `deploy/secure/docker-compose.secure.yml` for bundled `gog`                            | `Dockerfile` only installs `gog` in the final runtime stage; `deploy/secure/docker-compose.secure.yml` had been targeting `secure-runtime-assets`, which bypasses that install path entirely                                                                        |
| Model select appears inoperative / non-evidential             | Selection path appears functional in code; visibility was weak                                                                                           | New `model_selection` lifecycle event now records requested, resolved, final, attempts, and reason codes; helper test passes                                                                                                                                        |
| WhatsApp loops / self-echo / unreliable behavior              | Still degraded live, but core protections are present and recent fixes point to stale-route/shared-session contamination rather than missing suppression | Echo tracker exists in `extensions/whatsapp/src/auto-reply/monitor/echo.ts`; DM/main-route isolation exists in `extensions/whatsapp/src/auto-reply/monitor/process-message.ts`; recovery docs explicitly warn about stale external routing and shared cron sessions |
| Approval flow clunky and weakly evidenced                     | Improved but still degraded                                                                                                                              | Approval id parsing and expired-id UX are improved in `src/auto-reply/reply/commands-approve.ts`; no live chat approval roundtrip was run here                                                                                                                      |
| Slack not returning responses                                 | Most likely auth/config/env on the live deployment, not generic reply generation                                                                         | Slack runtime throws on missing bot/app tokens in `extensions/slack/src/monitor/provider.ts`; current workspace setup doc says live Eleanor Slack is not yet configured                                                                                             |
| Routing confidence low                                        | Improved materially                                                                                                                                      | Existing local routing fixes plus cron-target hardening remove implicit fallback behavior and preserve source-channel reply defaults                                                                                                                                |

## Ranked root-cause tree

1. High probability: secure production deploy built the wrong Docker stage
   - `deploy/secure/docker-compose.secure.yml` targeted `secure-runtime-assets`
   - that stage is not where `OPENCLAW_INSTALL_GOG` and `OPENCLAW_INSTALL_BROWSER` are applied
   - effect: auth/account exchange can succeed while the actual calendar runtime path is absent or non-evidential

2. High probability: cron delivery previously allowed hidden routing fallback
   - `src/cron/isolated-agent/delivery-target.ts` previously fell through to channel selection when no explicit recipient existed
   - that is incompatible with the operator requirement that Slack cron jobs use explicit recipients

3. Medium-high probability: explicit-target policy was over-applied to ordinary conversational turns
   - the validated local fix in `src/auto-reply/reply/get-reply-run.ts` limits `requireExplicitMessageTarget` to promoted internal webchat delivery only
   - this supports the routing contract that conversations return to their source channel by default

4. Medium probability: model selection was mostly invisible, not necessarily broken
   - fallback machinery already existed
   - the missing piece was operator-readable evidence for requested model, resolved model, fallback chain, final model, and reason codes

5. Medium probability: approval failures were worsened by brittle text parsing and weak expired-id feedback
   - wrapped ids such as `` `approval-123` `` and labeled ids could fail unnecessarily
   - expired approvals did not clearly tell the operator to use the latest prompt

6. Medium probability: Slack live failure is config/env, not the reply engine
   - live setup docs in this workspace still describe Slack as not configured
   - runtime startup clearly rejects missing tokens

7. Medium probability: WhatsApp instability is coming from stale routes / shared session reuse / cron contamination
   - secure recovery docs explicitly call out shared `agent:main:main` cron targets and stale external routing as recovery gates

## Quick-path fixes applied

### Added in this turn

- `deploy/secure/docker-compose.secure.yml`
  - removed the `secure-runtime-assets` target so secure production uses the final Docker runtime stage
  - this restores the actual optional install path for `gog` and keeps secure builds leaner than the intermediate workspace stage

- `src/auto-reply/reply/agent-runner.ts`
  - added `model_selection` lifecycle emission with:
    - requested provider/model
    - resolved/final provider/model
    - fallback-applied and fallback-cleared flags
    - attempt summaries and compact reason codes

- `src/auto-reply/reply/agent-runner.model-selection.test.ts`
  - added a focused helper test for the new model-selection event payload

### Validated existing local fixes already present in workspace

- `src/auto-reply/reply/get-reply-run.ts`
  - keeps explicit-target enforcement limited to internal webchat turns that were intentionally promoted into external delivery

- `src/auto-reply/reply/agent-runner-utils.ts`
  - forwards `requireExplicitMessageTarget` into the embedded runner params

- `src/cron/isolated-agent/delivery-target.ts`
  - now returns a clear recipient-resolution error when no explicit `delivery.to` and no prior session route exist

- `src/auto-reply/reply/commands-approve.ts`
  - normalizes wrapped/labeled approval ids
  - adds specific stale/expired approval guidance

## Full-recovery recommendations

1. Rebuild secure production from the final Docker stage and verify `gog` presence inside the running container before trusting any calendar/auth success.
2. Run one read-only calendar golden path in production after rebuild:
   - prove binary/tool presence
   - prove account access
   - prove one read-only calendar action
3. Confirm Slack live config before blaming reply generation:
   - bot token
   - app token for socket mode
   - allowlisted recipients
   - one approved DM and one approved channel/thread
4. Keep cron recipients explicit for Slack and do not reuse `last` unless the session already has a trustworthy previous route.
5. Use the new `model_selection` lifecycle event as the operator audit surface for model transitions and fallback reasons.
6. For WhatsApp, keep recovery validation focused on:
   - no duplicate replies
   - no self-echo
   - no cross-talk between peers
   - no shared-session cron delivery contamination

## Evidence snippets

### Secure deploy stage mismatch

Before this turn, `deploy/secure/docker-compose.secure.yml` explicitly used:

```yaml
target: secure-runtime-assets
```

But `Dockerfile` only installs `gog` in the final runtime stage:

```dockerfile
ARG OPENCLAW_INSTALL_GOG=""
COPY --from=gog-build /out/gog /tmp/gog
RUN if [ "$OPENCLAW_INSTALL_GOG" = "1" ]; then \
      install -m 0755 /tmp/gog /usr/local/bin/gog; \
    fi
```

That is a production-only divergence.

### Secure compose now resolves cleanly

```text
docker compose -f deploy/secure/docker-compose.secure.yml config
OK
```

### Targeted test evidence

```text
pnpm test -- src/auto-reply/reply/agent-runner.model-selection.test.ts \
  src/cron/isolated-agent/delivery-target.test.ts \
  src/auto-reply/reply/dispatch-from-config.test.ts \
  src/auto-reply/reply/get-reply-run.media-only.test.ts

Test Files  4 passed
Tests       87 passed
```

```text
pnpm test -- src/auto-reply/reply/commands.test.ts -t "/approve command"

Test Files  1 passed
Tests       6 passed | 46 skipped
```

### Slack failure classification evidence

`extensions/slack/src/monitor/provider.ts` fails fast on missing tokens:

```text
Slack bot + app tokens missing for account "<accountId>"
```

Current workspace Slack setup notes also say the live Eleanor deployment is not currently configured for Slack.

## Unresolved blockers

- No live production container or credentials were available in this workspace, so calendar and Slack could not be proven end-to-end.
- No local `openclaw:secure-mvp` image existed here, so actual image size could not be measured from a built artifact.
- A broad `commands.test.ts` run hit an unrelated long-running timeout in a leaf-subagent case; approval-specific tests passed when isolated and that unrelated timeout was not pursued in this turn.
