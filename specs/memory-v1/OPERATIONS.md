# OpenClaw v1 Operations

## Purpose

This document records standing operational rules, trust boundaries, communication behavior, and high-level permissions for the v1 control model.

## Naming

- official lightweight name: `Eleanor Lite`
- legacy alias: `ecloud lite (openclaw)`

## Trusted Roles

| Role             | Meaning                                   |
| ---------------- | ----------------------------------------- |
| operator         | the primary human controller              |
| assistant        | the OpenClaw runtime acting within policy |
| external_service | provider or platform dependency           |
| tenant_user      | end user or public-facing actor           |

## Trusted Channels

### Default trusted control channels

- `operator_thread`
- WhatsApp, if explicitly configured as an operator control channel

### Rules

1. Trusted operator channels may receive immediate acknowledgements and action reports.
2. Trusted operator channels are not the same as public or tenant-facing channels.
3. Channel trust should be allowlist-based, not inferred from message content alone.

## Standing Permissions

### Allowed without extra approval when explicitly operator-requested and in scope

- workspace reads
- workspace edits
- bounded patch application
- local verification
- state updates
- immediate operator-thread reporting
- trusted-operator WhatsApp acknowledgement and action reports

### Still approval-gated by default

- self-driven consequential actions
- third-party outbound sends not explicitly requested
- destructive mutations
- policy changes
- secret or auth changes
- sensitive private writes outside explicit request

## Trust Boundaries

- `operator_only`
- `project_only`
- `public`
- `family`
- `health`
- `finance`
- `secret`

Rules:

1. Boundary determines both retrieval and execution behavior.
2. Sensitive boundaries must never be mixed into default prompt compilation.
3. Public or tenant-facing actions should never inherit operator-only trust.

## Message Routing Rules

### Operator-requested actions

1. acknowledge request immediately on trusted operator channel
2. execute if allowed
3. confirm what happened using explicit state

### Self-driven actions

1. evaluate policy first
2. request approval when required
3. do not imply execution before confirmation

## Reporting Contract

Immediate operator reports should include:

- request id when available
- action summary
- resolved scope
- initiation source
- execution or delivery state
- reason when blocked or failed

## Memory Promotion Rules

1. stable operator preferences may become durable memory
2. sensitive facts must be stored privately first
3. durable lane should store private references, not raw sensitive values

## Audit Expectations

The system should record:

- task packet or request envelope
- resolved scope
- initiation source
- approval path
- evidence refs
- delivery or execution state

## v1 Operating Assumption

The system should optimize for low-friction execution of explicit operator intent while preserving guardrails for self-driven consequential behavior.
