# VM Deploy And 7-Day Review Evidence

## Exact commands run

```bash
# Phase 1 baseline
ssh openclaw-secure-vm 'hostname; date -u +%Y-%m-%dT%H:%M:%SZ; docker ps --format "table {{.Names}}\t{{.Status}}\t{{.RunningFor}}"; echo; docker inspect secure-openclaw-1 --format "restartCount={{.RestartCount}} startedAt={{.State.StartedAt}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}"; echo; docker exec secure-openclaw-1 sh -lc "openclaw channels status --probe | sed -n 1,220p"; echo; df -h / | tail -n 1; free -h | sed -n "1,2p"'
ssh openclaw-secure-vm 'docker logs --since 12h secure-openclaw-1 2>&1 | grep -E "Inbound message|Auto-replied to" | tail -n 260'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "nl -ba /home/node/.openclaw/agents/main/sessions/84b2bf60-c34e-4543-9f91-8060b254fb23.jsonl | sed -n 1,40p"'

# Deploy minimal hotfix (single-file mount, no rebuild)
ssh openclaw-secure-vm 'mkdir -p /root/.openclaw/hotfix/whatsapp/auto-reply/monitor'
scp extensions/whatsapp/src/auto-reply/monitor/process-message.ts openclaw-secure-vm:/root/.openclaw/hotfix/whatsapp/auto-reply/monitor/process-message.ts
ssh openclaw-secure-vm 'cat > /root/.openclaw/hotfix/whatsapp-hotfix.override.yml <<\"YAML\"
services:
  openclaw:
    volumes:
      - ${HOME}/.openclaw/hotfix/whatsapp/auto-reply/monitor/process-message.ts:/app/extensions/whatsapp/src/auto-reply/monitor/process-message.ts:ro
YAML'
ssh openclaw-secure-vm 'cd /root/openclaw && HOME=/root docker compose -f deploy/secure/docker-compose.secure.yml -f deploy/secure/docker-compose.dist-patch.override.yml -f /root/.openclaw/hotfix/whatsapp-hotfix.override.yml config >/tmp/openclaw-whatsapp-hotfix-config.txt && HOME=/root docker compose -f deploy/secure/docker-compose.secure.yml -f deploy/secure/docker-compose.dist-patch.override.yml -f /root/.openclaw/hotfix/whatsapp-hotfix.override.yml up -d openclaw'

# Post-deploy verification
ssh openclaw-secure-vm 'docker inspect secure-openclaw-1 --format "status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restartCount={{.RestartCount}} startedAt={{.State.StartedAt}}"'
ssh openclaw-secure-vm 'docker inspect secure-openclaw-1 --format "{{range .Mounts}}{{println .Destination \"<=\" .Source}}{{end}}"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "sed -n 430,520p /app/extensions/whatsapp/src/auto-reply/monitor/process-message.ts"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw channels status --probe | sed -n 1,220p"'
ssh openclaw-secure-vm 'docker logs --since 5m secure-openclaw-1 2>&1 | tail -n 220'

# WhatsApp primary proof probes
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw message send --channel whatsapp --target +16142889509 --message \"wa-dupfix-primary-20260328T075232Z\" --json"'
ssh openclaw-secure-vm 'docker logs --since 3m secure-openclaw-1 2>&1 | grep -E "Inbound message|Auto-reply emit|Suppressed duplicate auto-reply|Auto-replied to" | tail -n 220'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw message send --channel whatsapp --target +16142889509 --message \"Use gpt-5.4 nano wa-dupfix-primary-nano-20260328T075313Z\" --json"'
ssh openclaw-secure-vm 'docker logs --since 6m secure-openclaw-1 2>&1 | grep -E "Inbound message \\+16142889509 -> \\+16142889509|Auto-reply emit|Suppressed duplicate auto-reply|Auto-replied to" | tail -n 320'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "nl -ba /home/node/.openclaw/agents/main/sessions/84b2bf60-c34e-4543-9f91-8060b254fb23.jsonl | sed -n 22,34p"'

# Non-primary bounded probe attempt
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw message send --channel whatsapp --target +14047897894 --message \"wa-nonprimary-probe-20260328T075440Z\" --json"'
ssh openclaw-secure-vm 'docker logs --since 4m secure-openclaw-1 2>&1 | grep -E "Inbound message \\+14047897894|Auto-reply emit .*\\+14047897894|Auto-replied to \\+14047897894|3EB0FAA241CCF0128354C8" | tail -n 200'

# Model lane retention check
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 node -e '\''const fs=require("fs");const p="/home/node/.openclaw/agents/main/sessions/sessions.json";const s=JSON.parse(fs.readFileSync(p,"utf8"));const k="agent:main:whatsapp:direct:+16142889509";const v=s[k]||{};console.log(JSON.stringify({sessionKey:k,providerOverride:v.providerOverride??null,modelOverride:v.modelOverride??null,model:v.model??null,systemPromptModel:v.systemPromptReport?.model??null,updatedAt:v.updatedAt??null},null,2));'\'''

# Local scoped regression test for dedupe guard
pnpm test -- extensions/whatsapp/src/auto-reply/monitor/process-message.inbound-context.test.ts

# Phase X context/memory control audit
sed -n '1,260p' src/auto-reply/reply/memory-flush.ts
sed -n '1,760p' src/auto-reply/reply/agent-runner-memory.ts
sed -n '1,320p' src/auto-reply/reply/post-compaction-context.ts
sed -n '1,760p' src/auto-reply/reply/agent-runner.ts
sed -n '460,620p' src/auto-reply/reply/session.ts
rg -n "DEFAULT_PI_COMPACTION_RESERVE_TOKENS_FLOOR|reserveTokensFloor" src/agents/pi-settings.ts src/agents -S

ssh openclaw-secure-vm 'docker logs --since 7d secure-openclaw-1 2>&1 | grep -E "memoryFlush|memory flush|Auto-compaction|compaction|Context limit exceeded|post-compaction|Post-compaction context refresh|context compacted|fallback" | tail -n 500'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "grep -R -n --binary-files=without-match \"memoryFlush check: sessionKey=\" /app/dist | head -n 20"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "grep -R -n --binary-files=without-match \"memoryFlush skipped (context hash unchanged)\" /app/dist | head -n 20"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "grep -R -n --binary-files=without-match \"Post-compaction context refresh\" /app/dist | head -n 20"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "grep -R -n --binary-files=without-match \"readTranscriptTailMessages\" /app/dist | head -n 20"'

ssh openclaw-secure-vm 'docker exec secure-openclaw-1 node -e '\''const fs=require("fs");const p="/home/node/.openclaw/agents/main/sessions/sessions.json";const s=JSON.parse(fs.readFileSync(p,"utf8"));const keys=["agent:main:main","agent:main:whatsapp:direct:+16142889509","agent:main:whatsapp:direct:+14047897894"];const out={};for(const k of keys){const v=s[k]||{};out[k]={sessionId:v.sessionId??null,sessionFile:v.sessionFile??null,updatedAt:v.updatedAt??null,modelProvider:v.modelProvider??null,model:v.model??null,providerOverride:v.providerOverride??null,modelOverride:v.modelOverride??null,totalTokens:v.totalTokens??null,totalTokensFresh:v.totalTokensFresh??null,inputTokens:v.inputTokens??null,outputTokens:v.outputTokens??null,contextTokens:v.contextTokens??null,compactionCount:v.compactionCount??null,memoryFlushAt:v.memoryFlushAt??null,memoryFlushCompactionCount:v.memoryFlushCompactionCount??null,memoryFlushContextHash:v.memoryFlushContextHash??null};}console.log(JSON.stringify(out,null,2));'\'''
ssh openclaw-secure-vm "docker exec secure-openclaw-1 node -e 'const fs=require(\"fs\");const p=\"/home/node/.openclaw/agents/main/sessions/sessions.json\";const s=JSON.parse(fs.readFileSync(p,\"utf8\"));let total=0,compactionNonZero=0,flushAtCount=0,flushHashCount=0,flushCompactionCount=0;const samples=[];for(const [k,v] of Object.entries(s)){total++;const cc=typeof v.compactionCount===\"number\"?v.compactionCount:0;if(cc>0) compactionNonZero++;if(typeof v.memoryFlushAt===\"number\") flushAtCount++;if(typeof v.memoryFlushContextHash===\"string\"&&v.memoryFlushContextHash) flushHashCount++;if(typeof v.memoryFlushCompactionCount===\"number\") flushCompactionCount++;if(cc>0||typeof v.memoryFlushAt===\"number\"||typeof v.memoryFlushContextHash===\"string\"){samples.push({sessionKey:k,updatedAt:v.updatedAt??null,compactionCount:v.compactionCount??null,memoryFlushAt:v.memoryFlushAt??null,memoryFlushCompactionCount:v.memoryFlushCompactionCount??null,memoryFlushContextHash:v.memoryFlushContextHash??null,totalTokens:v.totalTokens??null,totalTokensFresh:v.totalTokensFresh??null});}}samples.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));console.log(JSON.stringify({totalSessions:total,compactionNonZero,flushAtCount,flushHashCount,flushCompactionCount,recentSamples:samples.slice(0,20)},null,2));'"

ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "ls -la /home/node/.openclaw/workspace; ls -la /home/node/.openclaw/workspace/memory 2>/dev/null || true; find /home/node/.openclaw/workspace -maxdepth 3 -type f -path \"*/memory/*.md\" -printf \"%TY-%Tm-%Td %TH:%TM:%TS %p\n\" 2>/dev/null | sort | tail -n 40"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "sed -n 1,120p /home/node/.openclaw/workspace/memory/2026-03-27.md; sed -n 1,120p /home/node/.openclaw/workspace/memory/2026-03-26.md"'

ssh openclaw-secure-vm "docker exec secure-openclaw-1 node -e 'const fs=require(\"fs\");const p=\"/home/node/.openclaw/agents/main/sessions/09825ddb-f683-4655-bc7a-bd4de51d5577.jsonl\";const rows=fs.readFileSync(p,\"utf8\").trim().split(\"\\n\").map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);const out=[];for(const r of rows){if(r.type===\"model_change\") out.push({timestamp:r.timestamp,type:r.type,provider:r.provider,modelId:r.modelId});if(r.type===\"custom\"&&r.customType===\"model-snapshot\") out.push({timestamp:r.timestamp,type:r.type,customType:r.customType,provider:r.data?.provider,modelId:r.data?.modelId});}console.log(JSON.stringify(out.slice(-20),null,2));'"
```

## Exact files inspected

```text
extensions/whatsapp/src/auto-reply/monitor/process-message.ts
extensions/whatsapp/src/auto-reply/monitor/process-message.inbound-context.test.ts
src/auto-reply/reply/memory-flush.ts
src/auto-reply/reply/agent-runner-memory.ts
src/auto-reply/reply/post-compaction-context.ts
src/auto-reply/reply/agent-runner.ts
src/auto-reply/reply/session.ts
src/agents/pi-settings.ts
deploy/secure/docs/VM_DEPLOY_AND_7DAY_REVIEW_REPORT.md
deploy/secure/docs/VM_DEPLOY_AND_7DAY_REVIEW_EVIDENCE.md
```

## Exact files changed

```text
extensions/whatsapp/src/auto-reply/monitor/process-message.ts
extensions/whatsapp/src/auto-reply/monitor/process-message.inbound-context.test.ts
deploy/secure/docs/VM_DEPLOY_AND_7DAY_REVIEW_REPORT.md
deploy/secure/docs/VM_DEPLOY_AND_7DAY_REVIEW_EVIDENCE.md
```

## Before / after observations

### Before

- WhatsApp primary had duplicate auto-reply evidence (`Auto-replied` twice for one inbound window).
- Primary failure boundary was unresolved in runtime path terms.
- Production was otherwise healthy.

### After

- Runtime path mismatch was resolved (hotfix mounted into `/app/extensions/.../process-message.ts`).
- Single-service recreate applied and health recovered.
- New instrumentation logs visible in production runtime:
  - `Auto-reply emit ...`
  - duplicate suppression marker available if triggered.
- Two primary probes showed one inbound and one outbound emit each, with no duplicate.
- Non-primary inbound remains unobserved in bounded test window.

## Trimmed evidence snippets

### Baseline health/capacity

```text
2026-03-28T07:49:09Z
secure-openclaw-1   Up 11 minutes (healthy)
secure-nginx-1      Up 8 days
/dev/root 19G total, 15G used, 3.1G free (83%)
```

### Pre-fix duplicate evidence

```text
2026-03-28T06:24:29.274Z Inbound message +16142889509 -> +16142889509
2026-03-28T06:24:36.709Z Auto-replied to +16142889509
2026-03-28T06:24:36.718Z Auto-replied to +16142889509
```

### Duplicate boundary support from session log

```text
message_id=3AEEC0BB57629994ECA2 present in user entry (session agent:main:whatsapp:direct:+16142889509)
single assistant final entry follows in same turn window
```

### Hotfix mounted and active

```text
/app/extensions/whatsapp/src/auto-reply/monitor/process-message.ts <= /root/.openclaw/hotfix/whatsapp/auto-reply/monitor/process-message.ts
```

```text
Auto-reply emit 1 ... (session=agent:main:whatsapp:direct:+16142889509, messageId=..., fp=...)
Suppressed duplicate auto-reply ...   # log path present (not triggered in probes)
```

### Primary probe A (post-fix)

```text
Inbound message +16142889509 -> +16142889509
Auto-reply emit 1 to +16142889509 (session=agent:main:whatsapp:direct:+16142889509, messageId=3EB00AB7BE17ADDF4FCB87, fp=9b985fdc037fc05e)
Auto-replied to +16142889509
```

### Primary probe B (post-fix)

```text
Inbound message +16142889509 -> +16142889509
Auto-reply emit 1 to +16142889509 (session=agent:main:whatsapp:direct:+16142889509, messageId=3EB0002C4188118AF60BA5, fp=4d29af49827af17d)
Auto-replied to +16142889509
```

### Non-primary bounded probe result

```text
Sent message 3EB0FAA241CCF0128354C8 -> sha256:43edcaf5f064
No inbound message observed from +14047897894 in bounded post-send log window
```

### Post-fix health

```text
status=running health=healthy restartCount=0 startedAt=2026-03-28T07:50:58.21344955Z
```

### Local scoped regression test

```text
Test Files  1 passed (1)
Tests      13 passed (13)
```

### Deployed runtime has memory-control code paths

```text
/app/dist/sessions-BzEFVjJr.js:... memoryFlush check: sessionKey=...
/app/dist/sessions-BzEFVjJr.js:... memoryFlush skipped (context hash unchanged)...
/app/dist/sessions-BzEFVjJr.js:... readTranscriptTailMessages(...)
/app/dist/sessions-BzEFVjJr.js:... [Post-compaction context refresh]
```

### Session-store compaction/flush marker sweep

```json
{
  "totalSessions": 13,
  "compactionNonZero": 0,
  "flushAtCount": 0,
  "flushHashCount": 0,
  "flushCompactionCount": 0
}
```

### Main and WhatsApp session memory/state snapshot

```text
agent:main:main -> totalTokens=57182 totalTokensFresh=true contextTokens=400000 compactionCount=0 memoryFlushAt=null
agent:main:whatsapp:direct:+16142889509 -> totalTokens=13164 totalTokensFresh=true contextTokens=400000 compactionCount=0 memoryFlushAt=null
agent:main:whatsapp:direct:+14047897894 -> totalTokens=10986 totalTokensFresh=true compactionCount=null memoryFlushAt=null
```

### Daily memory artifacts

```text
memory/2026-03-26.md  (mtime 2026-03-26 22:18 UTC)
memory/2026-03-27.md  (mtime 2026-03-27 18:33 UTC)
```

### Session drift (model override) evidence

```text
openclaw.json default model primary: openai/gpt-5.4
agent:main:main persisted override/model: openai/gpt-5.4-mini
main transcript snapshots include: gpt-5.4 -> gpt-5.4-nano -> gpt-5.4 -> gpt-5.4-mini
```

---

## Turn update evidence (2026-03-28 08:42Z–09:05Z)

### Exact commands run (additional)

````bash
# Baseline on production VM
ssh openclaw-secure-vm 'hostname; date -u +%Y-%m-%dT%H:%M:%SZ'
ssh openclaw-secure-vm 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.RunningFor}}"'
ssh openclaw-secure-vm 'docker inspect secure-openclaw-1 --format "restartCount={{.RestartCount}} startedAt={{.State.StartedAt}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}"'
ssh openclaw-secure-vm 'curl -fsS http://127.0.0.1:8080/healthz; echo; curl -fsS http://127.0.0.1:8080/readyz'
ssh openclaw-secure-vm 'df -h /; free -h | sed -n "1,2p"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw channels status --probe | sed -n 1,240p"'

# Runtime/config/session snapshots
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw models status --json"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw models list --json"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw models list --all --provider openai --plain | grep gpt-5.4"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw cron list --json"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw health --json"'

# Safety backups before edits
ssh openclaw-secure-vm 'cp /root/.openclaw/openclaw.json /root/.openclaw/openclaw.json.bak_20260328T0852Z'
ssh openclaw-secure-vm 'cp /root/.openclaw/agents/main/sessions/sessions.json /root/.openclaw/agents/main/sessions/sessions.json.bak_20260328T0852Z'

# Config normalization (heartbeat + compaction) and session override clear
ssh openclaw-secure-vm "docker exec secure-openclaw-1 node -e 'const fs=require(\"fs\");const p=\"/home/node/.openclaw/openclaw.json\";const cfg=JSON.parse(fs.readFileSync(p,\"utf8\"));cfg.agents=cfg.agents||{};cfg.agents.defaults=cfg.agents.defaults||{};cfg.agents.defaults.heartbeat={every:\"30m\",model:\"openai/gpt-5.4-nano\",lightContext:true,isolatedSession:true,target:\"none\"};cfg.agents.defaults.compaction={...(cfg.agents.defaults.compaction||{}),reserveTokensFloor:24000,postCompactionSections:[\"Session Startup\",\"Red Lines\"],memoryFlush:{enabled:true,softThresholdTokens:6000,forceFlushTranscriptBytes:\"512kb\"}};fs.writeFileSync(p,JSON.stringify(cfg,null,2)+\"\\n\");'"
ssh openclaw-secure-vm "docker exec secure-openclaw-1 node -e 'const fs=require(\"fs\");const p=\"/home/node/.openclaw/agents/main/sessions/sessions.json\";const s=JSON.parse(fs.readFileSync(p,\"utf8\"));const k=\"agent:main:main\";const v=s[k]||{};delete v.providerOverride;delete v.modelOverride;delete v.imageModelOverride;delete v.imageProviderOverride;v.model=\"gpt-5.4\";v.contextTokens=272000;s[k]=v;fs.writeFileSync(p,JSON.stringify(s,null,2)+\"\\n\");'"

# Heartbeat checklist upgrade + VM sync
scp deploy/secure/workspace-templates/eleanor/HEARTBEAT.md openclaw-secure-vm:/root/.openclaw/workspace/HEARTBEAT.md
ssh openclaw-secure-vm 'sed -n "1,260p" /root/.openclaw/workspace/HEARTBEAT.md'

## Memory flush cron-hook closure evidence (2026-03-28 09:24Z–09:43Z)

### Exact commands run (additional)

```bash
# Trace relevant source boundaries
rg -n "runMemoryFlushIfNeeded|runEmbeddedPiAgent" src/auto-reply/reply/agent-runner.ts src/cron/isolated-agent/run.ts
sed -n '520,700p' src/cron/isolated-agent/run.ts
sed -n '280,860p' src/auto-reply/reply/agent-runner-memory.ts

# Build + deploy patched dist overlay to VM
pnpm build
rsync -az --delete -e 'ssh -o BatchMode=yes' /Users/aurictechnology/openclaw/dist/ openclaw-secure-vm:~/.openclaw/dist-patch-runtime/
ssh openclaw-secure-vm 'docker restart secure-openclaw-1'

# Runtime proof runs and checks
ssh openclaw-secure-vm "docker exec secure-openclaw-1 sh -lc 'openclaw cron run 0cfbb2dd-ef75-41d5-a228-e2b5d4944608 --expect-final --timeout 360000'"
ssh openclaw-secure-vm "docker exec secure-openclaw-1 sh -lc 'tail -n 2 /home/node/.openclaw/cron/runs/0cfbb2dd-ef75-41d5-a228-e2b5d4944608.jsonl'"
ssh openclaw-secure-vm "docker exec secure-openclaw-1 sh -lc 'node -e '\''const fs=require(\"fs\");const e=JSON.parse(fs.readFileSync(\"/home/node/.openclaw/agents/main/sessions/sessions.json\",\"utf8\"))[\"agent:main:main\"];const st=fs.statSync(\"/home/node/.openclaw/workspace/memory/2026-03-28.md\");console.log(JSON.stringify({memoryFlushAt:e?.memoryFlushAt,memoryFlushContextHash:e?.memoryFlushContextHash,memoryFlushCompactionCount:e?.memoryFlushCompactionCount,memoryFileMtimeMs:st.mtimeMs},null,2));'\'''"

# Live audit visibility hardening (runtime-only patch) + validation
ssh openclaw-secure-vm 'cp /root/.openclaw/dist-patch-runtime/sessions-tC5rn1rA.js /root/.openclaw/dist-patch-runtime/sessions-tC5rn1rA.js.bak_20260328T0935Z'
scp /Users/aurictechnology/openclaw/.tmp_sessions-tC5rn1rA.js openclaw-secure-vm:/root/.openclaw/dist-patch-runtime/sessions-tC5rn1rA.js
ssh openclaw-secure-vm 'docker restart secure-openclaw-1'
ssh openclaw-secure-vm "docker exec secure-openclaw-1 sh -lc 'openclaw channels status --probe'"
ssh openclaw-secure-vm "docker exec secure-openclaw-1 sh -lc 'openclaw cron run 0cfbb2dd-ef75-41d5-a228-e2b5d4944608 --expect-final --timeout 360000'"
ssh openclaw-secure-vm "docker exec secure-openclaw-1 sh -lc 'ls -l /tmp/openclaw/memory_flush_decision.log; tail -n 20 /tmp/openclaw/memory_flush_decision.log'"
````

### Evidence snippets (additional)

```text
# Main-session cron run completion
... "jobId":"0cfbb2dd-ef75-41d5-a228-e2b5d4944608","status":"ok","runAtMs":1774690997333,"sessionId":"05101114-5087-4fff-9916-9271edd172ca","sessionKey":"agent:main:main" ...
```

```text
# Main-session decision audit emitted
[memory_flush_decision] sessionId=05101114-5087-4fff-9916-9271edd172ca runType=openai flushEligible=no reasonCode=token_and_transcript_gates_not_met transcriptHash=b41c7b48f91d68b7 compactionBefore=0 compactionAfter=0 persistenceWriteAttempted=no persistenceWriteSuccess=no
```

```json
{
  "memoryFlushAt": 1774690116269,
  "memoryFlushContextHash": "b41c7b48f91d68b7",
  "memoryFlushCompactionCount": 0,
  "memoryFileMtimeMs": 1774690114795.948
}
```

Observation:

- Decision hook now executes and is auditable on main-session cron path.
- For the latest controlled run, the exact gate blocking persistence is `token_and_transcript_gates_not_met`; therefore marker rewrite and daily-memory write were not attempted in that run.

### Auto-reply regression check (same runtime)

```text
openclaw message send --channel whatsapp --target +16142889509 --message "memory-flush-audit-regression-check-20260328T0948Z" --json
=> messageId: 3EB0F311862F804F6D130D
```

```text
tail /tmp/openclaw/memory_flush_decision.log
[memory_flush_decision] sessionId=05101114-5087-4fff-9916-9271edd172ca runType=openai flushEligible=no reasonCode=token_and_transcript_gates_not_met ...
[memory_flush_decision] sessionId=84b2bf60-c34e-4543-9f91-8060b254fb23 runType=openai flushEligible=no reasonCode=force_flush_size_not_met ...
```

# Config readback

ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw config get agents.defaults.heartbeat --json"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw config get agents.defaults.compaction --json"'

# Required single-service restart for runtime pickup

ssh openclaw-secure-vm 'docker restart secure-openclaw-1'
ssh openclaw-secure-vm 'docker logs --since 5m secure-openclaw-1 2>&1 | tail -n 260'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw channels status --probe | sed -n 1,240p"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw health --json"'

# Model/session probes

ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw agent --session-id 09825ddb-f683-4655-bc7a-bd4de51d5577 --message \"memory activation probe turn: summarize in one line\" --json"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw agent --session-id 09825ddb-f683-4655-bc7a-bd4de51d5577 --verbose on --message \"post-restart memory activation check: reply with ACTIVE\" --json"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw cron run 0cfbb2dd-ef75-41d5-a228-e2b5d4944608 --expect-final --timeout 360000"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw cron runs --id 0cfbb2dd-ef75-41d5-a228-e2b5d4944608 --limit 5 --expect-final --timeout 120000"'

# Heartbeat wake probe

ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw system event --mode now --text \"heartbeat-unified-intelligence-probe-20260328T0900Z\" --expect-final --json --timeout 120000"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw system heartbeat last"'

# WhatsApp post-restart safety probe

ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw message send --channel whatsapp --target +16142889509 --message \"wa-post-restart-memory-turn-20260328T0904Z\" --json"'
ssh openclaw-secure-vm 'docker logs --since 90s secure-openclaw-1 2>&1 | grep -E "3EB04F9641B7F257130FA0|Inbound message \\+16142889509 -> \\+16142889509|Auto-reply emit|Auto-replied to \\+16142889509|Suppressed duplicate auto-reply" | tail -n 80'

````

### Exact files inspected/changed (additional)

```text
deploy/secure/workspace-templates/eleanor/HEARTBEAT.md   (changed)
deploy/secure/docs/VM_DEPLOY_AND_7DAY_REVIEW_REPORT.md   (changed)
deploy/secure/docs/VM_DEPLOY_AND_7DAY_REVIEW_EVIDENCE.md (changed)
/root/.openclaw/openclaw.json                            (runtime config changed on VM)
/root/.openclaw/agents/main/sessions/sessions.json       (runtime session metadata changed on VM)
/root/.openclaw/workspace/HEARTBEAT.md                   (runtime workspace prompt changed on VM)
````

### Before/after observations (additional)

Before:

- `agent:main:main` persisted stale override to `gpt-5.4-mini`.
- heartbeat model was not explicitly pinned in config.
- compaction/memory-flush settings were not explicit in runtime config.

After:

- main override removed; main lane runs on `gpt-5.4`.
- heartbeat lane explicitly pinned and observed on `gpt-5.4-nano`.
- unified heartbeat checklist deployed on VM workspace.
- one required OpenClaw-only restart performed; channels recovered.
- WhatsApp duplicate/echo remained closed in post-restart bounded probe.
- memory flush markers still not written (`memoryFlushAt/hash` remained null) after non-CLI main-session cron run.

### Trimmed snippets (additional)

```text
heartbeat config:
{
  "every":"30m",
  "model":"openai/gpt-5.4-nano",
  "target":"none",
  "lightContext":true,
  "isolatedSession":true
}
```

```text
compaction config:
{
  "reserveTokensFloor":24000,
  "postCompactionSections":["Session Startup","Red Lines"],
  "memoryFlush":{"enabled":true,"softThresholdTokens":6000,"forceFlushTranscriptBytes":"512kb"}
}
```

```text
session override normalization:
before  providerOverride=openai modelOverride=gpt-5.4-mini contextTokens=400000
after   providerOverride=null   modelOverride=null         contextTokens=272000
```

```text
post-restart channels probe:
- WhatsApp default: enabled, configured, linked, running, connected
- Slack default: enabled, configured, running, works
```

```text
heartbeat lane evidence:
agent:main:main:heartbeat model=gpt-5.4-nano updatedAt=1774688557636
system heartbeat last: status=ok-token reason=wake durationMs=3795 silent=true
```

```text
main-lane evidence via cron:
job=0cfbb2dd-ef75-41d5-a228-e2b5d4944608 action=finished status=ok provider=openai model=gpt-5.4 durationMs=39139
```

```text
memory activation evidence gap:
agent:main:main memoryFlushAt=null memoryFlushCompactionCount=null memoryFlushContextHash=null
memory/2026-03-28.md => not present
```

```text
WhatsApp post-restart no-duplicate proof:
Sent message 3EB04F9641B7F257130FA0
Inbound message +16142889509 -> +16142889509
Auto-reply emit 1 ... messageId=3EB04F9641B7F257130FA0
Auto-replied to +16142889509
```

---

## Current turn evidence (WhatsApp inbound hardening live deploy)

### Exact commands run

```bash
# Verify local patch/test state
pnpm test -- extensions/whatsapp/src/monitor-inbox.streams-inbound-messages.test.ts

# VM: baseline + existing hotfix mount
ssh openclaw-secure-vm 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"'
ssh openclaw-secure-vm 'ls -la /root/.openclaw/hotfix; sed -n "1,200p" /root/.openclaw/hotfix/whatsapp-hotfix.override.yml'
ssh openclaw-secure-vm 'cd /root/openclaw && sed -n "1,220p" extensions/whatsapp/src/inbound/dedupe.ts'
ssh openclaw-secure-vm 'cd /root/openclaw && nl -ba extensions/whatsapp/src/inbound/monitor.ts | sed -n "420,500p"'

# VM: promote inbound files into hotfix path + create additive override + recreate openclaw
ssh openclaw-secure-vm 'mkdir -p /root/.openclaw/hotfix/whatsapp/inbound'
ssh openclaw-secure-vm 'cp /root/openclaw/extensions/whatsapp/src/inbound/dedupe.ts /root/.openclaw/hotfix/whatsapp/inbound/dedupe.ts'
ssh openclaw-secure-vm 'cp /root/openclaw/extensions/whatsapp/src/inbound/monitor.ts /root/.openclaw/hotfix/whatsapp/inbound/monitor.ts'
ssh openclaw-secure-vm 'cat > /root/.openclaw/hotfix/whatsapp-inbound-hardening.override.yml <<\"YAML\"
services:
  openclaw:
    volumes:
      - ${HOME}/.openclaw/hotfix/whatsapp/inbound/dedupe.ts:/app/extensions/whatsapp/src/inbound/dedupe.ts:ro
      - ${HOME}/.openclaw/hotfix/whatsapp/inbound/monitor.ts:/app/extensions/whatsapp/src/inbound/monitor.ts:ro
YAML'

# Attempted recreate path that still entered build and failed (ENOSPC)
ssh openclaw-secure-vm 'cd /root/openclaw/deploy/secure && docker compose -f docker-compose.secure.yml -f docker-compose.dist-patch.override.yml -f /root/.openclaw/hotfix/whatsapp-hotfix.override.yml -f /root/.openclaw/hotfix/whatsapp-inbound-hardening.override.yml up -d --no-deps --force-recreate openclaw'

# No-build recreate fix path
ssh openclaw-secure-vm 'cd /root/openclaw/deploy/secure && docker compose -f docker-compose.secure.yml -f docker-compose.dist-patch.override.yml -f /root/.openclaw/hotfix/whatsapp-hotfix.override.yml -f /root/.openclaw/hotfix/whatsapp-inbound-hardening.override.yml up -d --no-deps --no-build --pull never --force-recreate openclaw'
ssh openclaw-secure-vm 'CURRENT_IMAGE_ID=$(docker inspect secure-openclaw-1 --format "{{.Image}}"); docker image tag "$CURRENT_IMAGE_ID" openclaw:secure-mvp'
ssh openclaw-secure-vm 'cd /root/openclaw/deploy/secure && docker compose -f docker-compose.secure.yml -f docker-compose.dist-patch.override.yml -f /root/.openclaw/hotfix/whatsapp-hotfix.override.yml -f /root/.openclaw/hotfix/whatsapp-inbound-hardening.override.yml up -d --no-deps --no-build --pull never --force-recreate openclaw'

# Detect WhatsApp unlink and root cause
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw channels status --probe | sed -n 1,260p"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "ls -la /home/node/.openclaw/credentials/whatsapp/default | sed -n 1,80p"'
ssh openclaw-secure-vm 'find /root /home -type f -name creds.json -size +0c 2>/dev/null | sed -n "1,200p"'

# Restore non-empty creds from recovery and recreate openclaw only
ssh openclaw-secure-vm 'cp /root/.openclaw-recovery/credentials/whatsapp/default/creds.json /root/.openclaw/credentials/whatsapp/default/creds.json'
ssh openclaw-secure-vm 'chown 1000:1000 /root/.openclaw/credentials/whatsapp/default/creds.json && chmod 600 /root/.openclaw/credentials/whatsapp/default/creds.json'
ssh openclaw-secure-vm 'cd /root/openclaw/deploy/secure && docker compose -f docker-compose.secure.yml -f docker-compose.dist-patch.override.yml -f /root/.openclaw/hotfix/whatsapp-hotfix.override.yml -f /root/.openclaw/hotfix/whatsapp-inbound-hardening.override.yml up -d --no-deps --no-build --pull never --force-recreate openclaw'

# Post-recovery proof
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "openclaw channels status --probe | sed -n 1,260p"'
ssh openclaw-secure-vm 'docker inspect secure-openclaw-1 --format "{{range .Mounts}}{{println .Source \"->\" .Destination}}{{end}}" | grep -E "whatsapp/.*/process-message.ts|whatsapp/.*/inbound/dedupe.ts|whatsapp/.*/inbound/monitor.ts"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "sed -n 1,220p /app/extensions/whatsapp/src/inbound/dedupe.ts"'
ssh openclaw-secure-vm 'docker exec secure-openclaw-1 sh -lc "nl -ba /app/extensions/whatsapp/src/inbound/monitor.ts | sed -n 420,490p"'
ssh openclaw-secure-vm 'docker logs --since 3m secure-openclaw-1 2>&1 | grep -E "\\[whatsapp\\]|Listening for personal WhatsApp inbound|Decrypted message with closed session" | tail -n 260'
ssh openclaw-secure-vm 'df -h / | tail -n 1'
```

### Before / after observations (current turn)

Before:

- Deploy blocked by build-stage ENOSPC when compose attempted rebuild.
- WhatsApp inbound hardening was present in `/root/openclaw` source but not yet live-mounted in running container.

After:

- Inbound hardening files are mounted live in running container (`dedupe.ts`, `monitor.ts`).
- Existing outbound hardening mount remains active (`process-message.ts`).
- OpenClaw service recreated without image rebuild.
- WhatsApp recovered to `linked, running, connected` after creds restore from `/root/.openclaw-recovery/.../creds.json`.
- Slack remains `running, works`.

### Trimmed log/evidence snippets (current turn)

```text
# Build path failure boundary
ERR_PNPM_ENOSPC ... no space left on device ... /app/node_modules/@octokit/openapi-types_tmp_6/types.d.ts
```

```text
# Initial no-build recreate blocker
Error response from daemon: No such image: openclaw:secure-mvp
```

```text
# Runtime cause for WhatsApp unlink after first recreate
/home/node/.openclaw/credentials/whatsapp/default/creds.json size=0 (timestamp aligns with recreate)
```

```text
# Recovery source found
/root/.openclaw-recovery/credentials/whatsapp/default/creds.json (non-empty)
```

```text
# Final channel status
- WhatsApp default: enabled, configured, linked, running, connected, dm:allowlist, allow:+16142889509,+14047897894
- Slack default: enabled, configured, running, bot:env, app:env, works
```

```text
# Live mounted hardening files
/root/.openclaw/hotfix/whatsapp/auto-reply/monitor/process-message.ts -> /app/extensions/whatsapp/src/auto-reply/monitor/process-message.ts
/root/.openclaw/hotfix/whatsapp/inbound/dedupe.ts -> /app/extensions/whatsapp/src/inbound/dedupe.ts
/root/.openclaw/hotfix/whatsapp/inbound/monitor.ts -> /app/extensions/whatsapp/src/inbound/monitor.ts
```

```text
# Reconnect window signal (watchlist)
Decrypted message with closed session.
```
