# OpenClaw v1 Control Planes

## Purpose

This document defines the five control planes that govern OpenClaw v1:

1. Task plane
2. Execution plane
3. Memory plane
4. Context plane
5. Autonomy plane

The design goal is high usable context, bounded execution, clear approval behavior, and auditability without relying on large raw prompt windows.

## Plane Summary

| Plane     | Primary question                                    | Canonical substrate                                    | Output                                   |
| --------- | --------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| Task      | What is being asked?                                | task packet and request envelope                       | scoped objective and acceptance contract |
| Execution | What can run, where, and with what authority?       | wrappers, tiers, scopes, approvals                     | authorized action result                 |
| Memory    | What should persist and how should it be retrieved? | durable files, SQLite state, private store, audit lane | structured memory objects and summaries  |
| Context   | What should the model see right now?                | context compiler plus retrieval                        | compact compiled prompt packet           |
| Autonomy  | What should happen next without drifting?           | operational state plus bounded action catalog          | verified next action or escalation       |

## Task Plane

### Responsibilities

- normalize inbound requests into explicit task packets
- record scope, project, build, phase, objective, and constraints
- declare allowed actions, action scopes, and initiation source
- define response contract and report targets

### Inputs

- human message
- operator packet
- scheduled trigger
- external event

### Outputs

- `TaskPacket`
- resolved project or global scope
- initiation source
- acceptance checklist

### Rules

1. Human ingress may remain message-first.
2. Internal control work should be packetized.
3. Task packets should carry `allowed_action_scopes`.
4. Task packets should carry `initiation_source` when known.

## Execution Plane

### Responsibilities

- map actions to approval and authority rules
- enforce wrapper-first execution
- separate local workspace actions from runtime or tenant actions
- return explicit delivery and execution states

### Core Concepts

- tiers: `T0`, `T1`, `T2`, `T3`
- scopes: `global`, `cursor_workspace`, `operator_thread`, `external_runtime`, `tenant_surface`
- initiation: `operator_requested`, `self_driven`, `scheduled`, `external_triggered`
- results: `drafted`, `queued`, `sent`, `approval_required`, `blocked`, `failed`

### Rules

1. Wrapper surfaces are preferred over raw shell.
2. Approval must consider both scope and initiation source.
3. Explicit operator-requested actions should not be re-blocked by self-driven approval rules.
4. `sent` means transport-acknowledged, not merely authorized.

## Memory Plane

### Responsibilities

- preserve useful context outside the prompt
- separate durable, operational, sensitive, and audit memory
- govern promotion and retrieval

### Lanes

- `MEM_EPHEMERAL`
- `MEM_OPERATIONAL`
- `MEM_DURABLE`
- `MEM_SENSITIVE`
- `MEM_AUDIT`

### Rules

1. Durable memory remains file-compatible in v1.
2. Operational memory is deterministic and structured.
3. Sensitive memory is excluded from default retrieval.
4. Audit memory records provenance and inclusion manifests.

## Context Plane

### Responsibilities

- compile prompt context from externalized state
- reduce token use
- keep sensitive data out of default prompts

### Compiler Inputs

- recent exchange window
- operational state
- durable retrieval
- explicit exact snippets
- policy constraints
- sensitive memory only when allowed

### Compiler Outputs

- task summary
- recent window
- operational summary
- durable notes
- exact snippets
- constraints
- response contract
- inclusion manifest

## Autonomy Plane

### Responsibilities

- choose the next safe action
- execute within allowed authority
- verify the result
- write back state
- escalate when boundaries are crossed

### Loop

1. load operational state
2. inspect acceptance gaps and blockers
3. choose next bounded action
4. authorize action through execution policy
5. execute
6. verify
7. write back state and evidence
8. continue or escalate

### Rules

1. Autonomy is a bounded delegation loop, not a cron loop.
2. No state should advance to complete without evidence.
3. Escalation is mandatory at trust and ambiguity boundaries.

## Plane Interfaces

### Task -> Execution

Task packet defines:

- allowed actions
- allowed action scopes
- initiation source
- report targets

### Execution -> Memory

Execution emits:

- action result
- delivery state
- evidence refs
- audit events
- memory candidates

### Memory -> Context

Memory supplies:

- operational state
- durable notes
- sensitive references when authorized

### Context -> Autonomy

Context compiler provides:

- bounded current state
- constraints
- relevant facts
- explicit omissions

### Autonomy -> Task

Autonomy updates:

- phase
- blockers
- next actions
- verification state
- escalation reason

## v1 Status

This document defines the target control model for v1 implementation. It is the design contract, not proof of full runtime deployment.
