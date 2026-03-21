# Cloud Lite + WhatsApp Secure Capability Inventory

## Goal

Use the repo's existing security model to run:

- Cloud Lite as the only public broker/control plane
- Home services as outbound-only clients where possible
- Telegram as the private operator lane
- A dedicated WhatsApp number as the public/trusted-contact human lane
- HTTPS API on Cloud Lite only

## Available Today

### Control plane

- Browser Control UI exists and is served by the gateway.
- Trusted-proxy auth already exists for the Control UI and gateway WebSocket.
- Trusted-proxy-authenticated Control UI operator sessions can skip device pairing, so browser access can be gated by your reverse proxy and `allowUsers`.

Relevant files:

- `docs/web/control-ui.md`
- `docs/gateway/trusted-proxy-auth.md`
- `src/gateway/server/ws-connection/connect-policy.ts`
- `deploy/secure/openclaw/gateway.v1_1.fragment.json`

### Human channels

- WhatsApp is production-ready through WhatsApp Web / Baileys.
- Telegram supports a separate operator bot/account and allowlist-first DM policy.
- Both channels support explicit DM allowlists.

Relevant files:

- `docs/channels/whatsapp.md`
- `docs/channels/telegram.md`
- `extensions/whatsapp/src/channel.ts`
- `extensions/whatsapp/src/inbound/access-control.ts`
- `extensions/telegram/src/setup-surface.ts`

### API ingress

- Gateway HTTP APIs already exist for `/v1/chat/completions` and `/v1/responses`.
- They are separate from chat-channel ingress and can stay Cloud Lite-only.

Relevant files:

- `docs/gateway/openai-http-api.md`
- `docs/gateway/openresponses-http-api.md`
- `src/gateway/server-http.ts`

### Home / node topology

- Nodes are already modeled as outbound WebSocket clients to the gateway.
- This supports home-node outbound-only operation.

Relevant files:

- `docs/nodes/index.md`
- `docs/gateway/remote.md`

## Gaps

### Missing browser approval for channel DM pairing

Device pairing has browser UI support, but chat-channel pairing approvals still use CLI + store files.

Current path:

- `src/cli/pairing-cli.ts`
- `src/pairing/pairing-store.ts`

Impact:

- If you run WhatsApp with `dmPolicy: "pairing"`, approvals are currently CLI-driven.
- If you run WhatsApp with `dmPolicy: "allowlist"`, no new code is required for phase 1.

### Secure compose mismatch

`deploy/secure/docker-compose.secure.yml` still starts the gateway with `--bind lan`, while the hardened trusted-proxy fragment assumes loopback-only.

Relevant files:

- `deploy/secure/docker-compose.secure.yml`
- `deploy/secure/openclaw/gateway.v1_1.fragment.json`

## Recommended Secure Option Set

### Adopt

- Telegram as the private operator/admin channel
- Dedicated WhatsApp number as the public/trusted-contact human ingress
- HTTPS API on Cloud Lite only
- Home node outbound-only to Cloud Lite
- Browser-based admin via trusted-proxy Control UI on Cloud Lite
- Tailscale as fallback/admin path only

### Reject

- Personal WhatsApp as the long-term mixed admin/public/bot surface
- API traffic over chat channels
- Direct public exposure of home services
- `dmPolicy: "open"` for WhatsApp in the initial rollout

## What Is Required To Stand Up WhatsApp

### Required runtime pieces

- Cloud Lite gateway host with persistent `~/.openclaw`
- WhatsApp plugin installed
- Dedicated WhatsApp number/account available to scan QR
- Gateway running continuously on Cloud Lite
- `channels.whatsapp` configured after plugin install

### Required operator steps

1. Install plugin:

```bash
openclaw plugins install @openclaw/whatsapp
```

2. Apply secure config fragment after install.

3. Link WhatsApp:

```bash
openclaw channels login --channel whatsapp
```

4. Start gateway and verify:

```bash
openclaw channels status --probe
```

### Security posture for first bring-up

- `dmPolicy: "allowlist"`
- `allowFrom`: your personal operator number only
- `groupPolicy: "allowlist"`
- `groupAllowFrom`: your personal operator number only
- `groups.*.requireMention: true`
- no public pairing yet

## Validation Checklist

- Plugin installed and config validates
- QR link succeeds and `creds.json` is created
- WhatsApp channel shows configured + linked + running + connected
- Inbound DM from the allowlisted number is accepted
- Inbound DM from a non-allowlisted number is blocked
- Outbound reply lands back in WhatsApp
- Control UI is reachable only through the trusted proxy
- HTTP API is reachable only through Cloud Lite auth

## Follow-up Only If Needed

If phase 2 needs unknown trusted contacts to request access from WhatsApp, add browser approval for channel pairing instead of widening WhatsApp policy. That should be a small gateway RPC + Control UI change, not a new trust system.
