# OpenClaw v1 Autonomy Loop

## Purpose

This document defines the bounded autonomy loop for v1. The target is supervised autonomy, not unsupervised background execution.

## Core Principle

Autonomy should be:

- stateful
- bounded
- verifiable
- reversible where possible
- escalation-aware

It should not be:

- open-ended shell delegation
- repeated cron activity without state awareness
- completion claims without evidence

## Loop Stages

### 1. Load State

Load:

- operational state row
- active task packet
- blockers
- next actions
- verification state
- recent inclusion manifests if relevant

### 2. Inspect Gaps

Determine:

- unresolved acceptance criteria
- known blockers
- missing evidence
- policy or trust constraints

### 3. Choose Next Safe Action

Choose from a bounded catalog:

- inspect
- retrieve
- summarize
- prepare draft
- prepare patch
- apply bounded mutation
- verify result
- escalate

### 4. Authorize

Before execution, evaluate:

- action scope
- initiation source
- trust boundary
- approval default
- prerequisites

### 5. Execute

Execute via wrapper-first surfaces.

Expected output:

- result payload
- evidence refs
- delivery state when applicable

### 6. Verify

Verification must answer:

- did the action actually happen
- did it satisfy the intended step
- was the result consistent with policy
- is follow-up required

### 7. Write Back

Write back:

- updated phase
- blockers
- next actions
- last result
- evidence refs
- audit events
- memory candidates where appropriate

### 8. Continue Or Escalate

Continue only if:

- next action is clear
- authority exists
- verification passed
- no trust boundary was crossed

Escalate if:

- approval is required
- ambiguity remains material
- verification failed
- sensitive or destructive boundary was reached

## Action Selection Rules

1. Prefer the smallest action that resolves the biggest known gap.
2. Prefer verification before further mutation when state is uncertain.
3. Prefer drafts over direct sends when the action is not explicitly operator-requested.
4. Prefer deterministic state lookup over semantic guesswork.
5. Do not choose actions outside the declared scope.

## Escalation Triggers

Escalate when any of the following is true:

- `approval_required`
- destructive action
- policy or permission conflict
- unclear operator intent
- contradictory evidence
- missing auth or credentials
- sensitive retrieval without explicit authorization
- verification failure on a consequential action

## Verification Paths

Every action class needs a verification path.

| Action class | Verification example                                               |
| ------------ | ------------------------------------------------------------------ |
| observe      | response shape and source refs                                     |
| edit         | diff plus scoped test or parser check                              |
| schedule     | event id plus provider acknowledgement                             |
| send         | transport acknowledgement plus returned message id where available |
| operate      | service health or deploy status check                              |
| memory_write | row or file update plus audit event                                |

## State Object Expectations

Operational state should minimally include:

- `project`
- `build`
- `phase`
- `objective`
- `blockers`
- `next_actions`
- `verification_state`
- `authority_level`
- `last_result`
- `updated_at`

## Pseudocode

```text
loop:
  state = load_operational_state()
  gaps = inspect_acceptance_and_blockers(state)
  if gaps.require_escalation:
    emit_escalation(gaps.reason)
    stop

  action = choose_next_safe_action(state, gaps)
  auth = authorize(action, scope, initiation_source, trust_boundary)
  if auth.status != allowed:
    emit_escalation(auth.reason)
    stop

  result = execute(action)
  verification = verify(action, result)
  writeback(state, action, result, verification)

  if verification.failed or verification.requires_escalation:
    emit_escalation(verification.reason)
    stop

  if state.acceptance_complete:
    emit_complete()
    stop
```

## v1 Constraint

The autonomy loop should be implemented incrementally on top of structured operational state and execution policy. It is a control loop, not a replacement for policy.
