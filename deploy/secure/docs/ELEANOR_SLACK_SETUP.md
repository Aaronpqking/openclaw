# Eleanor Slack Setup

## Purpose

This is the operator-focused Slack bootstrap for Eleanor.

Use it to make Slack the primary work-facing surface without hiding routing in custom glue.

## Current state

- Slack support is production-ready in this repo.
- The live Eleanor deployment does not currently have Slack configured.
- Slack should be enabled through normal OpenClaw channel config and env vars.

## Required inputs before live enablement

- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN` for Socket Mode
- approved channel ids
- approved direct user ids
- pairing and allowlist policy choice

## Recommended mode

Use Socket Mode first.

Reasons:

- no inbound public webhook dependency
- simpler initial secure VM rollout
- easier to validate before exposing HTTP request paths

## Minimum config path

1. merge `deploy/secure/openclaw/eleanor-slack.fragment.json` into the live OpenClaw config
2. provide `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` to the gateway runtime
3. restart the container
4. verify with:
   - `openclaw channels status --probe`
   - Control UI channel checks
   - one approved DM
   - one approved channel/thread send

## Recommended policy

- `dmPolicy: "pairing"`
- `groupPolicy: "allowlist"`
- channel ids must be explicit
- do not use open group access for Eleanor by default

## Required operator records

Record these in `TOOLS.md` and `memory/approved-recipients.md`:

- Slack channel ids and purpose
- approved user ids
- whether the surface is for alerts, sprint updates, or direct work requests

## Stop conditions

- tokens missing
- channel ids missing
- unclear approved recipients
- no verified inbound and outbound probe
