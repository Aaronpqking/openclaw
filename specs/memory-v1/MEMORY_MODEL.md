# OpenClaw v1 Memory Model

## Purpose

This spec defines a v1 memory architecture for OpenClaw that preserves long-horizon context while keeping model prompts small and repeat summarization work low.

Goals:

1. Preserve raw history outside the prompt.
2. Keep active work state compact and deterministic.
3. Preserve compatibility with the current file-backed durable memory model in v1.
4. Isolate sensitive memory from default retrieval and prompt inclusion.
5. Emit an inclusion manifest for every compiled run.
6. Support a later autonomy loop without replacing the durable memory layer first.

Non-goals:

1. Replacing all workspace memory with DB truth in v1.
2. Indexing all private data into default semantic retrieval.
3. Replaying raw long transcripts into prompts by default.
4. Granting unrestricted autonomy or unrestricted shell execution.

## Design Principles

### Preserve Raw History Outside The Prompt

Transcripts, artifacts, logs, and documents should be stored as evidence, not continuously resent to the LLM.

### Use Structured State For Active Work

Current work state must be typed, cheap to load, and easy to update every run.

### Keep Durable Memory Compatible In v1

Durable memory remains compatible with the current workspace model built around `MEMORY.md` and daily memory notes. Adjacent bootstrap context such as `USER.md` remains supported, but it is not treated as the canonical durable memory search root.

### Isolate Sensitive Memory

Sensitive memory must not be part of default semantic search or default prompt inclusion.

### Compile Context Per Run

Every run should receive a compiled packet built from recent context, structured state, durable notes, and targeted evidence.

### Log What Was Included

Every compiled run must write an inclusion manifest for auditability and debugging.

### Support Both Global And Workspace-Scoped Action

The policy model must support actions that operate across the whole control plane and actions that are constrained to a specific Cursor workspace.

## Memory Classes

### MEM_EPHEMERAL

Purpose:

- current-turn scratch data
- temporary tool output summaries
- unresolved assumptions

Rules:

- short TTL
- not durable by default
- not indexed for long-term retrieval

### MEM_OPERATIONAL

Purpose:

- compact project and run state used for planning, routing, and bounded autonomy

Rules:

- structured
- SQLite-backed in v1
- retrieved deterministically
- updated every run

Examples:

- project
- build
- phase
- objective
- blockers
- next actions
- verification state
- authority level

### MEM_DURABLE

Purpose:

- reusable non-sensitive knowledge that should persist across runs and sessions

Rules:

- file-backed compatibility layer in v1
- may be mirrored into structured stores later
- may be indexed for semantic retrieval when non-sensitive
- subject to promotion, dedupe, and supersession rules

Canonical v1 roots:

- `MEMORY.md`
- `memory/YYYY-MM-DD.md`
- curated project notes such as `memory/projects/*.md`

Adjacent supported context sources:

- `USER.md`
- selected stable workspace notes

### MEM_SENSITIVE

Purpose:

- private information requiring special handling and restricted retrieval

Rules:

- separate private store in v1
- explicit wrapper-only read path
- no default semantic retrieval
- no default prompt inclusion
- purpose tag and trust-boundary aware

### MEM_AUDIT

Purpose:

- provenance, inclusion manifests, approvals, and memory mutation evidence

Rules:

- append-oriented
- SQLite-backed in v1
- not part of general memory retrieval

## Source Of Truth Precedence

Use this precedence table in v1:

| Lane              | Canonical truth                         | Use                                    |
| ----------------- | --------------------------------------- | -------------------------------------- |
| Raw evidence      | transcripts, artifacts, logs, documents | preservation and exact evidence        |
| Operational state | SQLite                                  | current run and project state          |
| Durable knowledge | workspace durable files                 | long-lived reusable context            |
| Sensitive memory  | private store                           | restricted personal/private context    |
| Retrieval cache   | vector index or search index            | lookup aid only, never canonical truth |
| Audit             | SQLite or append ledger                 | provenance and safety review           |

Rules:

1. Raw evidence is never replaced by summaries.
2. Operational state wins over inferred state reconstructed from chat.
3. Durable files remain the compatibility truth in v1.
4. Sensitive data stays in the private lane even when summarized.
5. Vector retrieval is an accelerator, not a source of truth.

## Retrieval Channels

### State Retrieval

Inputs:

- project
- build
- phase
- current task

Returns:

- operational state row
- blockers
- next actions
- verification state
- authority level

Method:

- deterministic DB lookup

### Durable Retrieval

Inputs:

- task query
- project context
- user context

Returns:

- relevant durable notes
- project summaries
- architecture decisions
- preferences

Method:

- semantic and keyword retrieval over curated non-sensitive durable roots only

Read-order rule:

1. project durable notes such as `memory/projects/*.md`
2. `MEMORY.md` for stable cross-project reusable facts
3. `USER.md` for operator profile, standing preferences, and communication rules
4. curated daily notes such as `memory/YYYY-MM-DD.md` as fallback summary context

Rules:

1. Project-specific notes outrank global durable notes for project-scoped retrieval.
2. `USER.md` is readable for stable operator preferences but is not the canonical durable search root.
3. Daily notes should be used as fallback summary context, not the first durable retrieval source.

### Sensitive Retrieval

Inputs:

- explicit wrapper invocation
- specific purpose
- trust boundary

Returns:

- narrowly scoped sensitive data or a summarized derivative

Method:

- explicit structured lookup only
- no broad default semantic retrieval

## Action Scope Policy

v1 policy must support at least these action scopes:

- `global`
- `cursor_workspace`
- `operator_thread`
- `external_runtime`
- `tenant_surface`

Definitions:

- `global`: an action that can affect cross-workspace state, shared services, or operator-wide control surfaces
- `cursor_workspace`: an action constrained to the current Cursor workspace or its directly owned artifacts
- `operator_thread`: an action that posts status, results, decisions, or confirmations into the active trusted operator control thread
- `external_runtime`: an action that touches deployed runtimes, auth providers, cloud infrastructure, background services, or other non-local execution environments
- `tenant_surface`: an action that affects end-user or tenant-visible behavior, including public-seat replies, outbound messaging, or tenant-facing workflow state

Rules:

1. Every action should have an explicit scope, even if inferred by the wrapper.
2. `cursor_workspace` should be the default for code and file mutations inside one workspace.
3. `operator_thread` is distinct from `external_send`; replies in a trusted operator control thread should not be classified as public or tenant-facing outbound mutations.
4. `global` should be used for cross-workspace state changes, shared runtime changes, or operator-wide policy/state updates.
5. `external_runtime` should gate deploys, runtime restarts, provider health checks, and cloud-side operational changes.
6. `tenant_surface` should gate public-facing or tenant-facing replies and consequential external messaging.
7. Approval and trust rules may differ by scope even for the same wrapper.
8. Inclusion manifests and audit events should record the action scope used.

## Delivery State Contract

Communication and action wrappers should not collapse delivery outcomes into a single vague success state.

Required delivery states:

- `drafted`
- `queued`
- `sent`
- `approval_required`
- `blocked`
- `failed`

Rules:

1. `sent` means the underlying transport or surface acknowledged acceptance of the message or action.
2. `queued` means the system accepted the request locally but the external transport has not confirmed it yet.
3. `drafted` means a non-delivered artifact was created and no external delivery occurred.
4. `approval_required` means the policy layer stopped delivery before transport submission.
5. `blocked` means policy, scope, trust, or prerequisite checks denied execution.
6. `failed` means the system attempted execution but did not receive a valid completion or acknowledgement.
7. Operator-facing replies should explicitly report the delivery state instead of implying delivery from authorization alone.
8. `operator_thread` replies should default to auto-send when the trust boundary is `operator_only` and the target is the active control thread.
9. `tenant_surface` and other public or external deliveries remain approval-gated unless an explicit rule relaxes them.

## Initiation And Approval Policy

Approval behavior must distinguish who initiated the action.

Supported initiation sources:

- `operator_requested`
- `self_driven`
- `scheduled`
- `external_triggered`

Definitions:

- `operator_requested`: the operator explicitly asked for the action in the current command or approved packet
- `self_driven`: the assistant selected the action autonomously
- `scheduled`: the action was triggered by a previously authorized schedule or workflow
- `external_triggered`: the action was triggered by an approved external event or integration

Rules:

1. Approval policy must evaluate both action scope and initiation source.
2. Explicit operator-requested actions should not require a second approval prompt when the request is explicit, in-scope, and the target surface is allowed.
3. Self-driven consequential actions remain approval-gated unless an explicit standing rule allows them.
4. Scheduled or externally triggered actions should follow the standing approval rule attached to the workflow that created them.
5. Audit records should capture whether the action was `operator_requested` or `self_driven`.
6. The execution result should make clear whether the action happened because of direct operator request or autonomous policy allowance.
7. For channels such as WhatsApp, the default rule should be:
   - explicit operator-requested action or send: allowed without further approval
   - self-driven action or send: approval required
8. This distinction applies to edits, mutations, scheduling, runtime operations, and outbound communication, not just messages.

## Control Channel Reporting Policy

Trusted operator channels may be used for immediate request acknowledgement and action reporting.

Required reporting events:

- `request_received`
- `action_confirmed`
- `action_report`

Definitions:

- `request_received`: the system acknowledges that an explicit operator request was accepted for execution
- `action_confirmed`: the system confirms that the requested action was authorized and started or queued
- `action_report`: the system reports what was actually done and the resulting delivery or execution state

Rules:

1. If WhatsApp is configured as a trusted operator control channel, explicit operator-requested actions should be acknowledged there immediately.
2. The system should confirm action start or acceptance immediately after authorization resolution.
3. The system should report actions taken to the trusted operator channel immediately after completion or failure.
4. Reports must use the explicit delivery and execution states rather than vague success wording.
5. Reporting to the trusted operator control channel is not the same as autonomous external messaging to third parties.
6. Immediate reporting should include enough detail to distinguish `drafted`, `queued`, `sent`, `blocked`, and `failed`.
7. Action reporting should cover not only sends but also edits, scheduling, mutations, deploys, and other consequential actions.

## Context Compiler

The context compiler is the primary token-reduction mechanism. In OpenClaw, this should be implemented as a context-engine path, not a parallel prompt assembly stack.

Inputs:

- current user message
- recent conversational window
- operational state store
- durable memory roots
- exact artifact snippets when explicitly needed
- sensitive store only when explicitly authorized
- system and policy constraints

Compiler pipeline:

1. Identify current scope and objective.
2. Fetch operational state deterministically.
3. Retrieve relevant durable notes.
4. Decide whether sensitive retrieval is authorized.
5. Fetch exact snippets only where materially helpful.
6. Rank and compact sections to fit budget.
7. Emit prompt packet.
8. Emit inclusion manifest.

Suggested section priority:

1. task and constraints
2. recent relevant exchange window
3. operational state summary
4. durable memory summaries
5. exact snippets
6. sensitive facts only if explicitly authorized

Hard rules:

- do not include raw long logs by default
- prefer summaries over full text
- include exact snippets only when they materially improve correctness
- truncate low-priority sections first

Response contracts and policy payloads should also record the resolved action scope and resulting delivery state where applicable.

## Summary Strategy

Summary types:

- turn summary
- project summary
- decision summary
- user profile summary

Summary rules:

1. Link summaries back to source refs when possible.
2. Refresh incrementally, not every run.
3. Never let a summary silently replace raw evidence.
4. Sensitive-derived summaries stay in the sensitive lane unless explicitly sanitized.

Refresh triggers should be threshold-based, such as:

- compaction completed
- operational state materially changed
- transcript growth crossed a configured threshold
- explicit promotion request

## Promotion Policy

Do not write arbitrary chat output directly into durable memory.

Promotion flow:

1. extract candidate
2. classify memory class
3. validate schema
4. check trust boundary and policy
5. determine retrieval eligibility
6. commit or quarantine
7. append audit entry
8. update supersession links if needed

Promotion targets:

- operational for run state and blockers
- durable for stable reusable non-sensitive facts
- sensitive quarantine for private data
- reject for low-confidence or one-off chatter

Durable candidates should usually satisfy at least one of:

- likely future reuse
- stable over time
- clearly user-endorsed or strongly grounded
- non-sensitive
- not redundant with existing memory

## Sensitive Data Rules

1. Do not place sensitive data into `MEMORY.md` or default durable roots.
2. Do not include sensitive data in prompts by default.
3. Do not index sensitive data into the general semantic index.
4. Use explicit wrappers for sensitive read access.
5. Prefer summaries or references when exact raw values are not required.
6. Log sensitive access in audit.
7. Support redaction and expiry where practical.

## Bulk Seeding Rules

Bulk seeding should follow the same lane separation as normal promotion.

Naming rule:

- the official lightweight operator-facing name is `Eleanor Lite`
- legacy references such as `ecloud lite (openclaw)` should be treated as aliases and mapped forward

Durable bulk seed inputs:

- stable user preferences
- coding and review style
- build and verification preferences
- architecture preferences
- trusted recurring project facts

Sensitive bulk seed inputs:

- health, workout, family, finance, or other private data

Sensitive bulk seed rule:

- parse into the private lane first
- write durable memory only with a stable reference to the private object
- do not inline raw sensitive values into durable memory

Recommended durable pattern:

```md
- Sensitive health profile: see `private://health/profile`
- Private family context: see `private://family/core`
```

Recommended private pattern:

- keep raw values in the private store
- optionally keep a short sanitized summary beside the raw value
- require purpose tags for retrieval where appropriate

## Wrapper Surface

Operational wrappers:

- `state_get`
- `state_update`
- `state_blocker_add`
- `state_blocker_resolve`
- `state_next_action_set`
- `state_result_writeback`

Durable wrappers:

- `memory_note_get`
- `memory_note_search`
- `memory_candidate_stage`
- `memory_candidate_promote`
- `memory_candidate_reject`
- `memory_summary_refresh`

Sensitive wrappers:

- `private_memory_stage`
- `private_memory_quarantine`
- `private_memory_get`
- `private_memory_summary_get`
- `private_memory_redact`
- `private_memory_expire`

Audit wrappers:

- `audit_manifest_write`
- `audit_memory_event_write`
- `audit_execution_event_write`
- `audit_query`

Compiler wrappers:

- `context_compile`
- `context_preview`
- `context_manifest_get`

Communication wrappers:

- `operator_thread_send`
- `operator_thread_confirm`
- `tenant_message_prepare`
- `tenant_message_send`
- `delivery_status_get`

## Suggested SQLite Tables

### operational_state

- `id`
- `project`
- `build`
- `phase`
- `objective`
- `blockers_json`
- `next_actions_json`
- `verification_state`
- `authority_level`
- `last_result_json`
- `updated_at`

### audit_manifest

- `id`
- `run_id`
- `task_packet_ref`
- `included_sources_json`
- `included_memory_classes_json`
- `sensitive_included`
- `warnings_json`
- `created_at`

### private_memory

- `id`
- `domain`
- `key`
- `value_json`
- `summary_json`
- `trust_boundary`
- `purpose_tags_json`
- `retrieval_default`
- `created_at`
- `updated_at`

### memory_events

- `id`
- `event_type`
- `memory_id`
- `source_refs_json`
- `actor`
- `details_json`
- `created_at`

## Compatibility Rules

1. Human channel ingress remains message-first in v1.
2. Typed task packets are optional and additive.
3. Durable workspace memory remains supported and active.
4. New DB-backed stores cover operational, sensitive, and audit lanes first.
5. Durable DB migration is phase 2, not v1.
6. Trusted operator-thread delivery remains distinct from tenant-facing or public outbound delivery.
7. Delivery confirmation should report `drafted`, `queued`, `sent`, `approval_required`, `blocked`, or `failed` explicitly.
8. Explicit operator-requested outbound sends should not be re-blocked by the same approval tier that only exists for self-driven actions.

## Phase Plan

### Phase 1

Build:

- `TASK_PACKET_SCHEMA.json`
- `AUTONOMY_STATE_SCHEMA.json`
- `MEMORY_OBJECT_SCHEMA.json`
- `EXECUTION_POLICY_SCHEMA.json`
- SQLite operational state store
- SQLite audit manifest store
- separate private memory store
- context compiler prototype
- wrapper catalog for state, memory, audit, and compiler lanes
- scope-aware communication and delivery-state policy contract

### Phase 2

Build:

- durable memory plugin
- migration plan from file-backed durable memory
- retrieval policy hardening
- optional mirrored durable DB index
- refined semantic retrieval controls

### Phase 3

Build:

- richer autonomy loop
- adaptive summary refresh
- conflict resolution and supersession logic
- broader policy-driven retrieval orchestration

## Acceptance Criteria

1. A run can preserve long history externally while using a compact prompt.
2. Operational state can be read and updated deterministically.
3. Durable notes remain compatible with the current workspace memory model.
4. Sensitive data is not included in prompts or default search unless explicitly requested.
5. Inclusion manifests are written for compiled runs.
6. Summaries reduce repeated token use across related runs.
7. Memory promotion follows class and policy rules.
8. Bulk seeding supports durable preferences plus private references without leaking raw sensitive data into default memory.
9. Operator-thread actions are distinguishable from tenant-facing sends in policy and audit records.
10. Delivery results explicitly distinguish `drafted`, `queued`, and `sent`.
11. Approval behavior distinguishes operator-requested sends from self-driven sends.
