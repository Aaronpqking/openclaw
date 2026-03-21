# OpenClaw v1 Enum Registry

## Purpose

This registry defines the stable enums used for task routing, policy enforcement, memory handling, context compilation, and autonomy state.

Specific artifacts and typed fields should carry detail that does not belong in enums.

## Envelope Enums

### `scope`

- `global`
- `project`

### `project`

- `none`
- `openclaw`
- `eleanor`
- `eliteforms`
- `shared`

### `build`

- `engine`
- `api`
- `ui`
- `infra`
- `memory`
- `autonomy`
- `execution`
- `policy`
- `trust`
- `channels`
- `google`
- `whatsapp`
- `node`
- `release`
- `docs`
- `tests`

### `phase`

- `discover`
- `diagnose`
- `design`
- `plan`
- `implement`
- `repair`
- `verify`
- `report`
- `blocked`
- `awaiting_decision`
- `deferred`
- `handoff`
- `complete`

### `intent`

- `status_update`
- `progress_update`
- `blocker_report`
- `decision_request`
- `risk_alert`
- `execution_request`
- `memory_update`
- `policy_update`
- `spec_update`
- `handoff`

### `reply_mode`

- `summary`
- `detailed`
- `checkpoint`
- `enum_only`

### `autonomy_mode`

- `observe`
- `propose`
- `execute_safe`
- `execute_bounded`
- `escalate`

## Initiation Enums

### `initiation_source`

- `operator_requested`
- `self_driven`
- `scheduled`
- `external_triggered`

### `report_event`

- `request_received`
- `action_confirmed`
- `action_report`

## Work Enums

### `work_type`

- `feature`
- `bugfix`
- `regression`
- `refactor`
- `migration`
- `cleanup`
- `hardening`
- `test_gap`
- `docs_gap`
- `infra_fix`
- `policy_change`
- `memory_design`
- `autonomy_design`
- `integration`

### `work_subtype`

- `state_bug`
- `auth_bug`
- `routing_bug`
- `config_bug`
- `deploy_bug`
- `memory_bug`
- `channel_bug`
- `node_bug`
- `ui_bug`
- `data_bug`
- `sync_bug`
- `permission_bug`
- `retrieval_bug`
- `prompt_bug`
- `schema_gap`
- `safety_gap`

### `target_area`

- `parser`
- `policy`
- `prompts`
- `approvals`
- `contacts`
- `allowlist`
- `queue`
- `session`
- `websocket`
- `control_ui`
- `channel_runtime`
- `deploy_compose`
- `nginx`
- `oauth`
- `storage`
- `memory_store`
- `vector_index`
- `audit_log`
- `wrapper_layer`
- `autonomy_loop`
- `context_compiler`

### `verification_state`

- `not_started`
- `partial`
- `passed_scoped`
- `passed_live`
- `failed`
- `blocked`

### `failure_mode`

- `none`
- `repro_missing`
- `env_missing`
- `auth_missing`
- `upstream_bug`
- `design_gap`
- `unsafe_to_continue`
- `insufficient_context`

## Blocker Enums

### `blocker_type`

- `auth`
- `permission`
- `missing_secret`
- `missing_scope`
- `missing_tool`
- `runtime_failure`
- `invalid_config`
- `deploy_drift`
- `data_gap`
- `operator_action`
- `unsafe_boundary`
- `upstream_dependency`
- `unclear_requirement`
- `policy_conflict`
- `trust_conflict`

### `blocker_owner`

- `operator`
- `openclaw`
- `assistant`
- `external_service`
- `repo_gap`
- `unknown`

### `blocker_severity`

- `minor`
- `material`
- `major`
- `fatal`

### `blocker_next_step`

- `needs_approval`
- `needs_secret`
- `needs_login`
- `needs_pairing`
- `needs_scope_upgrade`
- `needs_config_change`
- `needs_restart`
- `needs_redeploy`
- `needs_design_decision`
- `needs_manual_validation`
- `needs_artifact`
- `needs_schema_update`

### `decision_type`

- `approve`
- `reject`
- `choose_option`
- `provide_value`
- `defer`
- `continue_read_only`

## Memory Enums

### `memory_class`

- `ephemeral`
- `operational`
- `durable`
- `sensitive`
- `audit`

### `memory_action`

- `observe_only`
- `stage_candidate`
- `promote_operational`
- `promote_durable`
- `quarantine_sensitive`
- `redact`
- `expire`
- `summarize`
- `reindex`

### `trust_boundary`

- `none`
- `project_only`
- `operator_only`
- `family`
- `public`
- `secret`
- `health`
- `finance`

## Execution Enums

### `execution_action`

- `inspect`
- `test`
- `patch_prepare`
- `patch_apply`
- `restart`
- `redeploy`
- `pair`
- `send_message`
- `sync_state`
- `write_memory`
- `promote_memory`
- `quarantine_memory`

### `execution_surface`

- `wrapper`
- `config`
- `workspace`
- `node`
- `gateway`
- `channel`
- `memory_store`
- `blob_store`
- `db`
- `vector_index`
- `audit_store`

### `execution_risk`

- `safe`
- `bounded`
- `elevated`
- `external`
- `destructive`

### `action_scope`

- `global`
- `cursor_workspace`
- `operator_thread`
- `external_runtime`
- `tenant_surface`

### `delivery_state`

- `drafted`
- `queued`
- `sent`
- `approval_required`
- `blocked`
- `failed`

## Policy Enums

### `policy_effect`

- `tighten`
- `loosen`
- `no_change`

### `approval_default`

- `auto`
- `bounded_auto`
- `explicit`

## Guidance

1. Keep these enums stable once automation depends on them.
2. Add project-specific extension enums only when general enums are insufficient.
3. Put nuanced detail in artifact payloads, summaries, or typed fields rather than expanding enums prematurely.
