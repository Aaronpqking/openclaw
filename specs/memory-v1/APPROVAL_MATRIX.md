# OpenClaw v1 Approval Matrix

## Purpose

This matrix defines the default approval behavior for action classes in v1. Approval is determined by:

1. action class
2. action scope
3. initiation source
4. trust boundary

This document defines defaults. Explicit standing policy can tighten or loosen a cell when required.

## Core Rule

- `operator_requested`: do not ask twice for the same allowed action
- `self_driven`: require approval whenever the action is consequential unless a standing rule says otherwise

## Action Classes

| Action class     | Examples                                               |
| ---------------- | ------------------------------------------------------ |
| observe          | status, read, list, search, summarize                  |
| draft            | prepare message, create draft artifact, patch proposal |
| edit             | workspace file change, bounded mutation                |
| schedule         | create event, commit to time                           |
| send             | WhatsApp send, email send, tenant-facing reply         |
| operate          | restart, redeploy, runtime mutation                    |
| memory_write     | promote durable memory, write operational state        |
| sensitive_access | read or mutate sensitive/private data                  |
| policy_change    | execution or trust policy mutation                     |
| destructive      | delete, revoke, public posting, irreversible mutation  |

## Default Matrix

### `operator_requested`

| Scope              | observe | draft        | edit         | schedule     | send         | operate      | memory_write | sensitive_access | policy_change | destructive |
| ------------------ | ------- | ------------ | ------------ | ------------ | ------------ | ------------ | ------------ | ---------------- | ------------- | ----------- |
| `cursor_workspace` | auto    | auto         | auto         | bounded_auto | bounded_auto | bounded_auto | bounded_auto | explicit         | explicit      | explicit    |
| `operator_thread`  | auto    | auto         | auto         | auto         | auto         | n/a          | bounded_auto | explicit         | explicit      | explicit    |
| `external_runtime` | auto    | bounded_auto | bounded_auto | bounded_auto | bounded_auto | bounded_auto | bounded_auto | explicit         | explicit      | explicit    |
| `tenant_surface`   | auto    | bounded_auto | bounded_auto | bounded_auto | bounded_auto | bounded_auto | bounded_auto | explicit         | explicit      | explicit    |
| `global`           | auto    | bounded_auto | bounded_auto | bounded_auto | bounded_auto | bounded_auto | bounded_auto | explicit         | explicit      | explicit    |

### `self_driven`

| Scope              | observe | draft        | edit         | schedule | send     | operate  | memory_write | sensitive_access | policy_change | destructive |
| ------------------ | ------- | ------------ | ------------ | -------- | -------- | -------- | ------------ | ---------------- | ------------- | ----------- |
| `cursor_workspace` | auto    | bounded_auto | bounded_auto | explicit | explicit | explicit | bounded_auto | explicit         | explicit      | explicit    |
| `operator_thread`  | auto    | bounded_auto | bounded_auto | explicit | explicit | n/a      | bounded_auto | explicit         | explicit      | explicit    |
| `external_runtime` | auto    | explicit     | explicit     | explicit | explicit | explicit | explicit     | explicit         | explicit      | explicit    |
| `tenant_surface`   | auto    | explicit     | explicit     | explicit | explicit | explicit | explicit     | explicit         | explicit      | explicit    |
| `global`           | auto    | explicit     | explicit     | explicit | explicit | explicit | explicit     | explicit         | explicit      | explicit    |

## WhatsApp Rule

WhatsApp should usually be treated as one of two things:

1. trusted operator control channel
2. external/tenant outbound channel

Defaults:

- explicit operator-requested WhatsApp action to the trusted operator channel: `auto` or `bounded_auto`
- self-driven WhatsApp action: `explicit`
- WhatsApp messages to third parties: follow `tenant_surface` or external send defaults

## Delivery Confirmation Rule

The agent must not claim more than it knows.

| State               | Meaning                                                |
| ------------------- | ------------------------------------------------------ |
| `drafted`           | artifact created, not delivered                        |
| `queued`            | accepted for delivery, awaiting transport confirmation |
| `sent`              | transport acknowledged delivery request                |
| `approval_required` | stopped before execution pending approval              |
| `blocked`           | denied by policy or prerequisites                      |
| `failed`            | attempted and failed                                   |

## Reporting Rule

When a trusted operator channel exists, the system should:

1. acknowledge explicit request receipt immediately
2. confirm authorization and action acceptance immediately
3. report actual action result immediately after execution

## Hard Stops

Always require explicit approval for:

- destructive actions
- policy mutation
- auth or secret mutation
- sensitive private writes without explicit operator request
- financial or health-sensitive consequential actions

## Missing Data Rule

If the action is otherwise allowed but lacks required prerequisites:

- return `blocked`, not `approval_required`
- provide the missing requirement explicitly
- do not silently downgrade to a draft unless policy says to do so
