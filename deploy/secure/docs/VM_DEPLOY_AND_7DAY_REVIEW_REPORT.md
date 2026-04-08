# VM Deploy And 7-Day Review Report

## 1. Executive summary

This turn closed the WhatsApp primary duplicate auto-reply blocker with a minimal production-safe hotfix and retained evidence.

- Duplicate boundary identified as **duplicate outbound emission** (not duplicate inbound, not duplicate run).
- Minimal fix applied: outbound idempotency/dedupe guard in WhatsApp auto-reply final delivery path.
- Deployment used a file-level bind mount hotfix overlay and single-service recreate (`secure-openclaw-1`) only.
- Post-fix primary probes show `1 inbound -> 1 auto-reply emit -> 1 outbound` with no duplicate and no observed echo loop.

Current residual gap:

- WhatsApp non-primary inbound remains **UNPROVEN** (attempted bounded probe, no inbound observed).

## 2. Deployment actions taken

Applied this production-safe hotfix path:

1. Copied patched file to VM host path:
   - `/root/.openclaw/hotfix/whatsapp/auto-reply/monitor/process-message.ts`
2. Added compose hotfix override:
   - `/root/.openclaw/hotfix/whatsapp-hotfix.override.yml`
   - mounts single file to:
   - `/app/extensions/whatsapp/src/auto-reply/monitor/process-message.ts`
3. Recreated only `openclaw` service with existing secure + dist-patch overlays plus hotfix override.
4. Verified mount active and patched instrumentation present in running container.

No rebuild was performed.

## 3. Whether restart was required

- Required this turn: **Yes**
- Performed this turn: **Yes**
- Why required: compose volume/mount changes do not apply until container recreation.
- Why minimal: only `secure-openclaw-1` was recreated; `secure-nginx-1` was left untouched.

## 4. VM capacity snapshot

Snapshot near deploy/probe window:

- Disk `/`: `19G` total, `15G` used, `3.1G` free (`83%`)
- Memory: `7.2Gi` total, `1.6Gi` used, `1.1Gi` free, `5.5Gi` available
- Container state post-fix: `secure-openclaw-1` running, health `healthy`

Capacity judgment: **MARGINAL** (runtime stable, rebuild headroom still tight).

## 5. WhatsApp duplicate-analysis (focused)

Pre-fix duplicate incident evidence:

- `2026-03-28T06:24:29.274Z` inbound: `+16142889509 -> +16142889509`
- `2026-03-28T06:24:36.709Z` `Auto-replied to +16142889509`
- `2026-03-28T06:24:36.718Z` `Auto-replied to +16142889509`

Timeline boundary:

- Inbound message id: `3AEEC0BB57629994ECA2`
- Sender/peer: `+16142889509` (primary)
- Session key: `agent:main:whatsapp:direct:+16142889509`
- Session log shows one user turn and one assistant final for that inbound window.
- Therefore failure boundary is consistent with **duplicate outbound emission** in delivery path.

Fix applied:

- Added short-TTL outbound dedupe guard keyed by:
  - `sessionKey + inboundMessageId + replyFingerprint`
- Added lightweight operator logs:
  - `Auto-reply emit <n> ... messageId=... fp=...`
  - `Suppressed duplicate auto-reply ...` (if triggered)

## 6. WhatsApp primary certification

Post-fix primary probes:

Probe A (`messageId=3EB00AB7BE17ADDF4FCB87`)

- inbound seen once
- `Auto-reply emit 1 ... messageId=3EB00AB7BE17ADDF4FCB87`
- one `Auto-replied to +16142889509`

Probe B (`messageId=3EB0002C4188118AF60BA5`)

- inbound seen once
- `Auto-reply emit 1 ... messageId=3EB0002C4188118AF60BA5`
- one `Auto-replied to +16142889509`

Echo/loop check:

- no immediate follow-on self-loop chain observed in bounded post-reply log window.

Judgment:

- WhatsApp primary now meets this turn’s pass standard: **PASS**.

## 7. WhatsApp non-primary certification

Non-primary bounded probe was attempted (`+14047897894`):

- outbound send succeeded (`messageId=3EB0FAA241CCF0128354C8`)
- no inbound from `+14047897894` observed in bounded review window
- no non-primary inbound records found in recent logs/session sweep

Judgment:

- WhatsApp non-primary inbound reliability: **UNPROVEN** (supported path exists, but inbound not observed).

## 8. Focused channel matrix (current)

| Channel/path                          | Configured        | Authenticated          | Inbound seen              | Run triggered | Outbound delivered   | Origin return confirmed               | Status   |
| ------------------------------------- | ----------------- | ---------------------- | ------------------------- | ------------- | -------------------- | ------------------------------------- | -------- |
| Slack thread path                     | Yes               | Yes                    | Yes                       | Yes           | Yes                  | Yes                                   | PASS     |
| WhatsApp primary (`+16142889509`)     | Yes               | Yes (linked/connected) | Yes                       | Yes           | Yes                  | Yes (single-reply verified in probes) | PASS     |
| WhatsApp non-primary (`+14047897894`) | Yes (allowlisted) | Yes                    | No (bounded probe window) | Unproven      | Outbound only proven | Unproven                              | UNPROVEN |
| cron single explicit recipient        | Yes               | N/A                    | N/A                       | Yes           | Yes                  | Yes                                   | PASS     |

## 9. Top current blockers

1. Non-primary WhatsApp inbound certification gap (no direct inbound evidence yet).
2. VM disk headroom remains marginal for clean rebuild windows.

## 10. Fast path to green and golden path

Fast path to green:

- capture one real inbound from `+14047897894` and verify `1 inbound -> 1 emit -> 1 outbound`, no duplicate/echo.

Golden path to full operational standard:

- bake this dedupe fix into next standard production image in a scheduled low-risk window, remove temporary file-mount hotfix, and remediate disk headroom.

## 11. Context/Memory Control Status (Phase X)

Code-path check (repo source):

- `src/auto-reply/reply/memory-flush.ts` has threshold gating, transcript-hash dedupe (`computeContextHash`), and once-per-compaction guard (`memoryFlushCompactionCount`).
- `src/auto-reply/reply/agent-runner-memory.ts` uses transcript-tail reads (`readSessionLogSnapshot`, `readTranscriptTailMessages`) instead of full-log loading and skips flush on heartbeat/CLI lanes.
- `src/auto-reply/reply/agent-runner.ts` triggers memory flush pre-turn and post-compaction reinjection via `readPostCompactionContext(...)`.
- `src/auto-reply/reply/post-compaction-context.ts` builds reinjection payload (`[Post-compaction context refresh]`) and date-substitutes `memory/YYYY-MM-DD.md`.

Deployed runtime check (active VM container):

- `/app/dist/sessions-BzEFVjJr.js` contains:
  - `memoryFlush check: sessionKey=...`
  - `memoryFlush skipped (context hash unchanged)...`
  - `readTranscriptTailMessages(...)`
  - `[Post-compaction context refresh]`

Operational state in current production window:

- Current session store has no active compaction/flush markers:
  - `compactionNonZero: 0`
  - `flushAtCount: 0`
  - `flushHashCount: 0`
  - `flushCompactionCount: 0`
- Main and WhatsApp sessions are currently far from compaction thresholds given large context windows (notably `contextTokens: 400000` for active lanes).

## 12. Evidence of Active Compaction/Flush

What is active:

- The compaction + memory flush control logic is present in source and present in deployed runtime bundle.
- Daily memory artifacts exist and were written recently (`memory/2026-03-26.md`, `memory/2026-03-27.md`).

What is not currently active in this window:

- No compaction events found in current session artifacts.
- No memory flush metadata currently recorded in active session store fields.
- No post-compaction reinjection events observed during this turn’s runtime evidence window.

Judgment:

- Controls are deployed but not currently triggered by token pressure in observed sessions.

## 13. Evidence of Stale Context or Session Drift

No evidence that current WhatsApp duplicate behavior was caused by memory/compaction logic:

- Duplicate issue boundary was outbound duplicate emission and was fixed independently.
- Current memory/compaction markers are inactive (no correlated compaction/flush event at duplicate windows).

Session-drift evidence (model lane):

- Config default model remains `openai/gpt-5.4`.
- Main session currently persists override/model at `gpt-5.4-mini` (`agent:main:main`), indicating session-level drift from configured default.
- Main transcript model snapshots show transition sequence including `gpt-5.4-mini` at `2026-03-28T07:05:25.639Z`.

Risk boundary:

- This is session-state drift risk, but not evidenced as compaction reinjection regression in this window.

## 14. Token/Context Risk Assessment

Current token posture:

- `agent:main:main`: `totalTokens=57182`, `totalTokensFresh=true`, `contextTokens=400000`
- `agent:main:whatsapp:direct:+16142889509`: `totalTokens=13164`, `contextTokens=400000`

Assessment:

- Immediate context-overflow risk is low for currently active sessions.
- Compaction/flush inactivity is expected at current token levels, not a failed runtime path by itself.
- Main-session override drift raises medium operational risk for model consistency and cost/behavior predictability.

## Verdict

PROD_STATUS: YELLOW
RESTART_REQUIRED_THIS_TURN: YES
RESTART_PERFORMED_THIS_TURN: YES
WHATSAPP_PRIMARY: PASS
WHATSAPP_PRIMARY_FAILURE_CLASS: NONE
WHATSAPP_NON_PRIMARY: UNPROVEN
DEDUPE_GUARD_ADDED: YES
PRIMARY_BLOCKER: WhatsApp non-primary inbound remains unproven; primary duplicate/echo blocker is closed.
FAST_PATH_TO_GREEN: Capture one real non-primary inbound turn and verify single-run single-outbound behavior with the new emit logs.
GOLDEN_PATH_TO_FULL_STANDARD: Bake the dedupe fix into the next standard image and remove temporary hotfix mount during a disk-safe maintenance window.
MEMORY_FLUSH_ACTIVE: PRESENT_BUT_INACTIVE
COMPACTION_ACTIVE: PRESENT_BUT_INACTIVE
POST_COMPACTION_REINJECTION: PRESENT_BUT_INACTIVE
DAILY_MEMORY_WRITES: PASS
CONTEXT_WINDOW_CONTROL: PASS
STALE_SESSION_STATE_RISK: MEDIUM

---

## 15. Current Turn Update (2026-03-28 08:42Z–09:05Z)

Scope in this turn:

- activate existing memory/compaction controls (no redesign)
- normalize session/model lanes (heartbeat + main + WhatsApp)
- upgrade heartbeat inputs to unified delta instructions
- preserve WhatsApp primary reliability and verify no post-restart regression

Actions applied:

1. heartbeat lane pinned to nano in live config:
   - `agents.defaults.heartbeat.model = openai/gpt-5.4-nano`
   - `lightContext = true`, `isolatedSession = true`, `target = none`, `every = 30m`
2. compaction/memory-flush settings explicitly set in live config:
   - `agents.defaults.compaction.reserveTokensFloor = 24000`

---

## 16. Memory Flush Cron-Hook Closure Update (2026-03-28 09:24Z–09:43Z)

Scope completed this turn:

- wired the existing `runMemoryFlushIfNeeded(...)` hook into the main-session cron run path before embedded execution
- restored always-on memory flush decision audit fields in runtime
- ran controlled main-session cron probes and checked marker/file persistence

Minimal deploy actions:

1. Source patch prepared in repo:
   - `src/cron/isolated-agent/run.ts` (pre-run memory flush hook wiring)
   - `src/auto-reply/reply/agent-runner-memory.ts` (decision audit emission)
2. Production runtime patch deployed via dist overlay files (no rebuild on VM):
   - `/root/.openclaw/dist-patch-runtime/gateway-cli-ZAYo2w8c.js`
   - `/root/.openclaw/dist-patch-runtime/sessions-tC5rn1rA.js`
3. Restarted only `secure-openclaw-1` when runtime JS changed.

Main-session cron evidence:

- Controlled run completed:
  - job `0cfbb2dd-ef75-41d5-a228-e2b5d4944608`
  - `runAtMs=1774690997333`, `status=ok`, `sessionId=05101114-5087-4fff-9916-9271edd172ca`
- Decision audit was emitted for that main session:
  - `[memory_flush_decision] sessionId=05101114-5087-4fff-9916-9271edd172ca runType=openai flushEligible=no reasonCode=token_and_transcript_gates_not_met transcriptHash=b41c7b48f91d68b7 ... persistenceWriteAttempted=no persistenceWriteSuccess=no`
- Marker/file checks after the same run:
  - `memoryFlushAt` unchanged at `1774690116269`
  - `memoryFlushContextHash` unchanged at `b41c7b48f91d68b7`
  - memory file mtime unchanged (`/home/node/.openclaw/workspace/memory/2026-03-28.md` mtime `1774690114795.948`)

Exact blocking condition (now evidenced):

- Flush decision executes on main-session cron path, but is currently ineligible due `reasonCode=token_and_transcript_gates_not_met`, so persistence markers and daily-memory write are not attempted on that run.

Latest turn judgment:

- Wiring blocker is closed (hook now called on main-session cron path).
- Persistence proof for the latest controlled run is blocked by current flush gates, not by missing hook execution.

### Latest memory-flush verdict

RESTART_REQUIRED_THIS_TURN: YES
RESTART_PERFORMED_THIS_TURN: YES
MEMORY_FLUSH_DECISION_AUDIT: PASS
MEMORY_FLUSH_TRIGGER: FAIL
MEMORY_FLUSH_PERSISTENCE: FAIL
TODAYS_MEMORY_WRITE_FROM_FLUSH_PATH: FAIL
AUTO_REPLY_FLUSH_REGRESSION: PASS
PRIMARY_BLOCKER: Main-session flush hook now executes, but current run is gated out (`token_and_transcript_gates_not_met`) so persistence writes are not attempted.
FAST_PATH_TO_GREEN: Trigger one controlled main-session run that satisfies flush gates (token/transcript threshold) so the same run emits audit plus marker/file persistence.

- `agents.defaults.compaction.postCompactionSections = ["Session Startup","Red Lines"]`
- `agents.defaults.compaction.memoryFlush.enabled = true`
- `agents.defaults.compaction.memoryFlush.softThresholdTokens = 6000`
- `agents.defaults.compaction.memoryFlush.forceFlushTranscriptBytes = "512kb"`

3. stale main-session model override cleared:
   - `agent:main:main` override removed (`providerOverride/modelOverride`)
   - main context normalized to `contextTokens=272000`
4. heartbeat operator checklist upgraded and synced to VM workspace:
   - `deploy/secure/workspace-templates/eleanor/HEARTBEAT.md`
   - `/root/.openclaw/workspace/HEARTBEAT.md`

## 16. Whether restart was required (this turn)

- Required this turn: **Yes**
- Performed this turn: **Yes** (single service only: `secure-openclaw-1`)
- Why required: config changes were acknowledged by CLI as requiring gateway reload; restart applied to ensure runtime picked up compaction/heartbeat model changes.
- Restart scope: OpenClaw service only; nginx untouched.

Post-restart safety checks:

- `healthz` and `readyz`: OK
- `openclaw channels status --probe`: WhatsApp connected, Slack works
- WhatsApp post-restart probe:
  - one outbound test message (`3EB04F9641B7F257130FA0`)
  - one inbound event
  - one `Auto-reply emit 1`
  - one `Auto-replied`
  - no duplicate/echo in bounded window

## 17. Memory Activation Status

Code/runtime presence:

- memory flush, transcript-tail dedupe, and post-compaction refresh code paths remain present in deployed runtime (`/app/dist/sessions-BzEFVjJr.js`).

Runtime activation attempt:

- executed non-CLI main-session cron run (`0cfbb2dd-ef75-41d5-a228-e2b5d4944608`) after restart
- run completed `status=ok` with `provider=openai`, `model=gpt-5.4`, duration ~39s

Observed result:

- `agent:main:main` still shows:
  - `memoryFlushAt = null`
  - `memoryFlushCompactionCount = null`
  - `memoryFlushContextHash = null`
- `memory/2026-03-28.md` not created during this turn

Judgment:

- memory/compaction controls are deployed, but flush markers remain inactive in observed production runs this turn.

## 18. Session Normalization Status

Confirmed:

- `agent:main:main` override drift removed (no persisted provider/model override)
- main session is now executing on `gpt-5.4` (proved by live run + cron run metadata)
- heartbeat session `agent:main:main:heartbeat` is executing on `gpt-5.4-nano`
- WhatsApp direct owner session remains `gpt-5.4-nano`

Constraint boundary:

- Grok PM lane is not currently supportable in this runtime due missing xAI runtime key/support path.

## 19. Unified Heartbeat Inputs

Heartbeat instruction surface is upgraded in production workspace with explicit unified/delta contract:

- one cross-channel intelligence snapshot
- delta-only reporting window
- Slack + WhatsApp signal requirement
- actionable/memorable rollups
- dev-work cadence blocks

Live check:

- heartbeat wake run succeeded (`status=ok-token`, `reason=wake`, `silent=true`)
- heartbeat session remains on `gpt-5.4-nano`

## 20. Bruce Rollup Logic

Implemented as instruction-layer logic in heartbeat checklist:

- explicit Bruce rollup buckets:
  - actionables
  - memorables
  - updates
  - blockers
  - follow-ups
- explicit de-duplication requirement across channels

Evidence quality:

- instruction is deployed and loaded; this turn’s heartbeat output was token-silent (`HEARTBEAT_OK` class), so bucketed output is not yet fully exercised in live payload.

## 21. Calendar/Email Delta Logic

Implemented as instruction-layer heartbeat logic:

- calendar deltas: new/changed/cancelled with action requirement
- email deltas: urgent unread/reply-needed/approval-needed/priority-shifting
- explicit “no full-history replay” and archive-only handling

Evidence quality:

- prompt/checklist path is active; this turn produced no non-empty heartbeat payload to demonstrate the full delta rendering contract.

## 22. Dev Work Heartbeat Cadence

Implemented in heartbeat checklist:

- active workstreams + blockers + decisions + pending approvals + next actions + origin-channel signals
- explicit mention of Eleanor / EliteForms / IRG cadence tracking

Evidence quality:

- logic is deployed; full structured output remains partially unproven in this window due token-silent heartbeat result.

## 23. Current blocker ranking (this turn)

1. **Memory flush activation evidence gap**: markers (`memoryFlushAt/hash`) still not observed after restart + non-CLI main-session run.
2. **Heartbeat rich-output proof gap**: upgraded unified heartbeat logic is deployed but recent heartbeat run was silent (`ok-token`), so delta section rendering remains partial.
3. **VM capacity remains marginal**: still ~3.1G free on `/` (83% used).

## 24. Updated verdict (supersedes earlier verdict block)

PROD_STATUS: YELLOW
RESTART_REQUIRED_THIS_TURN: YES
RESTART_PERFORMED_THIS_TURN: YES
WHATSAPP_PRIMARY_LOCKED_COMPLETE: YES
MEMORY_FLUSH_ACTIVE: PRESENT_BUT_INACTIVE
COMPACTION_ACTIVE: PRESENT_BUT_INACTIVE
POST_COMPACTION_REINJECTION: PRESENT_BUT_INACTIVE
PAST_MEMORY_STATUS: PRESERVED_AND_ACCESSIBLE
SESSION_NORMALIZATION: PASS
HEARTBEAT_LANE_NANO: PASS
GROK_PM_LANE: UNSUPPORTED
HEARTBEAT_CALENDAR_DELTAS: PARTIAL
HEARTBEAT_EMAIL_DELTAS: PARTIAL
HEARTBEAT_BRUCE_ROLLUP: PARTIAL
HEARTBEAT_ACTIONABLES_MEMORABLES: PARTIAL
DEV_HEARTBEAT_CADENCE: PARTIAL
UNIFIED_INTELLIGENCE_ACROSS_CHANNELS: PARTIAL
PRIMARY_BLOCKER: Memory flush remains present-but-inactive in observed production runs (no `memoryFlushAt/hash` markers yet).
FAST_PATH_TO_GREEN: Add minimal always-on flush decision audit (one line per eligible run) and capture one production run that writes `memoryFlushAt/hash` and today’s memory file.
GOLDEN_PATH_TO_FULL_STANDARD: Close the flush trigger boundary with a narrow patch, re-certify heartbeat rich delta output once, and keep single-service restart-only deployment discipline.

## 25. Current Turn Update (WhatsApp inbound hardening deploy, no rebuild)

Objective executed:

- Promote already-prepared WhatsApp inbound dedupe/replay hardening into live production runtime without full image rebuild.

What was applied:

1. Added additive hotfix override:
   - `/root/.openclaw/hotfix/whatsapp-inbound-hardening.override.yml`
2. Mounted patched files into running service:
   - `/app/extensions/whatsapp/src/inbound/dedupe.ts`
   - `/app/extensions/whatsapp/src/inbound/monitor.ts`
3. Preserved existing outbound hardening mount:
   - `/app/extensions/whatsapp/src/auto-reply/monitor/process-message.ts`
4. Recreated only `secure-openclaw-1` (no nginx restart, no rebuild).

ENOSPC boundary:

- Initial compose recreate path still invoked build and failed with:
  - `ERR_PNPM_ENOSPC` during install.
- Final successful deploy path used:
  - `--no-build --pull never --force-recreate`
  - after tagging current running image as `openclaw:secure-mvp`.

Transient regression and recovery:

- After first recreate, WhatsApp became `not linked`.
- Exact cause found: `/root/.openclaw/credentials/whatsapp/default/creds.json` became zero bytes at recreate time.
- Minimal recovery applied:
  - restored non-empty creds from `/root/.openclaw-recovery/credentials/whatsapp/default/creds.json`
  - recreated only `secure-openclaw-1` again.
- Post-recovery status:
  - WhatsApp `linked, running, connected`
  - Slack `running, works`
  - container `healthy`.

Residual risk:

- Log line `Decrypted message with closed session.` observed during reconnect window; no immediate disconnect loop followed.
- Live no-duplicate/no-echo proof for this exact inbound patch set remains **UNPROVEN in this turn** (patch mounted + channel connected + focused tests previously passed, but no controlled owner inbound replay probe captured in this window).

### 25.1 Turn verdict (supersedes only this turn’s deploy status)

PROD_STATUS: YELLOW
DEPLOY_APPLIED: YES
RESTART_REQUIRED_THIS_TURN: YES
RESTART_PERFORMED_THIS_TURN: YES
WHATSAPP_RUNTIME_CONNECTIVITY: PASS
WHATSAPP_INBOUND_HARDENING_LIVE: PASS
WHATSAPP_NO_DUPLICATE_PROOF_THIS_TURN: UNPROVEN
PRIMARY_BLOCKER: Live inbound duplicate/echo certification for the newly mounted inbound dedupe path is not yet captured post-deploy.
FAST_PATH_TO_GREEN: Capture one controlled owner-device inbound and verify exactly one inbound handling path plus one outbound reply with no duplicate/echo.
GOLDEN_PATH_TO_FULL_STANDARD: Keep no-build hotfix deploy path, preserve creds backup rotation, and roll this hardening into next disk-safe image bake.
