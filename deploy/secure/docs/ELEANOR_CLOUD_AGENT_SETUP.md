# Eleanor Cloud-Agent Setup

## Purpose

Define the minimum safe operating environments for Eleanor as a semi-autonomous operator.

This package is meant to support:

- OpenClaw runtime and deployment oversight
- Slack-based work coordination
- approved-contact WhatsApp coordination
- EliteForms sprint supervision

It is not a license to give a generic cloud agent broad production credentials.

## Recommended environment split

### `eleanor-safe-default`

Purpose:

- read docs
- inspect repos
- prepare plans
- draft status updates
- review sprint state

Required env vars:

- none

Explicit exclusions:

- no production credentials
- no Slack tokens
- no WhatsApp credentials
- no SSH private keys
- no deploy credentials

### `eleanor-slack-ops`

Purpose:

- operate as the work-facing delegate in Slack
- publish sprint updates
- receive operator requests in Slack

Required env vars:

- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN` for Socket Mode, or `SLACK_SIGNING_SECRET` for HTTP mode

Conditionally required:

- `OPENCLAW_GATEWAY_TOKEN` if the control surface is protected by gateway token auth

Explicit exclusions:

- no unrelated cloud provider credentials
- no Stripe, DB, or app secrets from EliteForms
- no broad admin passwords

### `eleanor-runtime-ops`

Purpose:

- inspect the Eleanor VM
- verify health, logs, config, and channel status
- apply reviewed runtime workspace updates

Required capabilities:

- SSH access to the Eleanor VM through the approved private path
- access to the mounted OpenClaw workspace/config on that host

Explicit exclusions:

- no rotation of secrets from inside the agent loop
- no direct use of production credentials outside the approved host

### `eleanor-eliteforms-supervisor`

Purpose:

- supervise EliteForms sprint execution
- inspect the EliteForms repo and its sprint docs
- draft sprint summaries and blocker reports

Required env vars:

- none by default

Conditionally required:

- staging-only URLs or test credentials only when a specific EliteForms validation task requires them

Explicit exclusions:

- no production patient data
- no backend database credentials
- no long-lived deploy credentials

## Operating rules

- Keep Slack and WhatsApp as distinct trust surfaces.
- Slack is the work coordination surface.
- WhatsApp is the personal/operator coordination surface.
- Do not reuse broad production env bundles just because they are convenient.
- Prefer OpenClaw-hosted routing and policy over custom sidecar agent glue.

## Channel model

- Slack should become Eleanor's primary work-facing reporting surface.
- WhatsApp should remain restricted to approved contacts and operator-authorized workflows.
- Other OpenClaw-supported channels may be configured when there is a real need and an approved destination.
- Control-plane reports should not pretend Slack exists until the runtime and policy model explicitly support it.

## Immediate rollout order

1. Clean the repo and isolate the Eleanor operator package.
2. Install the Eleanor workspace files from `deploy/secure/workspace-templates/eleanor/`.
3. Configure Slack in the runtime using `deploy/secure/docs/ELEANOR_SLACK_SETUP.md` and `deploy/secure/openclaw/eleanor-slack.fragment.json`.
4. Verify Slack inbound/outbound and pairing/allowlist behavior.
5. Only then add recurring sprint heartbeats and cron-driven summaries.

## Stop conditions

- Missing Slack channel ids or recipient ids
- Unclear approval boundary for outbound sends
- Any requirement to embed production secrets directly in workspace files
- Any task that would make Eleanor impersonate Aaron instead of acting as Eleanor
