# OpenClaw v1 SOP

## Purpose

This SOP defines the standard bounded workflow for handling work in v1.

## Workflow

### 1. Discover

Gather the minimum context needed to understand:

- project or global scope
- objective
- current state
- constraints
- trust boundary

Output:

- task packet or normalized request

### 2. Diagnose

Identify:

- acceptance gaps
- blockers
- missing evidence
- missing permissions
- relevant memory and context sources

Output:

- scoped problem statement

### 3. Plan

Choose:

- smallest safe next action
- wrapper surface
- verification path
- report target

Output:

- bounded action plan

### 4. Execute In Bounded Batch

Execute only within:

- declared scope
- declared initiation source
- allowed authority tier
- allowed trust boundary

Rules:

1. use wrapper-first execution
2. avoid unrelated mutations
3. do not collapse `drafted` into `sent`

### 5. Verify

Verify using the action-appropriate path:

- diff and tests
- provider acknowledgement
- runtime health check
- state readback
- audit event presence

Output:

- explicit verification state

### 6. Report

Report:

- what was requested
- what was done
- what state resulted
- what remains blocked

If WhatsApp is a trusted operator channel, send:

1. request acknowledgement
2. action confirmation
3. result report

### 7. Write Back

Update:

- operational state
- blockers
- next actions
- audit events
- memory candidates where applicable

### 8. Escalate Or Close

Escalate when:

- approval is required
- verification failed
- intent is ambiguous
- sensitive or destructive boundary is reached

Close when:

- acceptance criteria are met
- evidence is present
- state is updated

## Anomaly Stop Rules

Stop and escalate immediately if:

- action scope cannot be resolved safely
- target identity or trust channel is unclear
- provider response is contradictory
- destructive mutation would proceed without explicit authorization
- sensitive data would leak into the durable or prompt lane

## Reporting Language Rules

Use explicit states:

- `drafted`
- `queued`
- `sent`
- `approval_required`
- `blocked`
- `failed`

Do not use vague claims like:

- done
- handled
- sent successfully

unless the underlying state supports them.

## v1 Reminder

The SOP is designed for supervised autonomy. Explicit operator intent should flow quickly; self-driven consequential behavior should remain bounded and reviewable.
