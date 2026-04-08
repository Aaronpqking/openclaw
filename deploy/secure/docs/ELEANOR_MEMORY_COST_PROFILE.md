# Eleanor Memory Cost Profile

## Goal

Keep Eleanor resilient and cheap until the operating design is proven.

The important distinction is:

- durable memory in Markdown is the core system
- vector memory search is optional
- compaction and memory flush should be cheap and stable
- heartbeats should be isolated and lightweight

## What the current code already does well

- pre-compaction memory flush writes durable notes to `memory/YYYY-MM-DD.md`
- only one memory flush runs per compaction cycle
- duplicate flushes are reduced with transcript-hash deduplication
- post-compaction context can re-inject critical `AGENTS.md` sections
- context overflow and compaction failures reset cleanly instead of silently dying
- expired auth-profile cooldowns are cleared automatically so providers do not stay stuck

## What is expensive by default

- `agents.defaults.memorySearch` defaults to enabled
- memory embeddings auto-select a remote provider when a key exists
- `memorySearch.sync.onSessionStart`, `onSearch`, and `watch` all default on
- memory flush uses the active run model lane unless `agents.defaults.compaction.model` is pinned
- heartbeats only become cheap if `lightContext` and `isolatedSession` are explicitly enabled

## Recommended cost-first profile

1. Keep Markdown memory on.
2. Disable `memorySearch` until recall quality is worth the extra indexing cost.
3. Pin heartbeat to `openai/gpt-5.4-nano`.
4. Pin compaction to `openai/gpt-5.4-mini`.
5. Keep a healthy compaction reserve so resets are rare.
6. Use coding-specialist models only by explicit override, not as the always-on default lane.

## Model guidance

### General assistant work

- heartbeat: `openai/gpt-5.4-nano`
- normal assistant/chat: `openai/gpt-5.4-mini`

I do not recommend `nano` as the only global model for Eleanor because routing, approvals, and operator summaries have more blast radius than simple triage.

### Coding lanes

- trusted coding lane: `openai-codex/gpt-5.4`
- low-cost coding lane: `xai/grok-code-fast-1`
- optional experimental cost lane: DeepSeek or Groq-hosted coding models only when their billing and quota are healthy

## Provider caution

- direct xAI Grok support exists in this repo
- direct OpenAI Codex support exists in this repo
- direct DeepSeek and Groq use should stay opt-in per task until live stability is proven

## Deployment note

Use `deploy/secure/openclaw/eleanor-memory-cost.fragment.json` as the initial config fragment.
