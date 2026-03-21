# Runtime Capability Audit

This audit maps the current secure runtime to repo-verified OpenClaw status surfaces so an operator can tell the difference between:

- unavailable: the runtime does not expose the capability at all
- disabled: the capability exists in this build but policy/config keeps it off
- misconfigured: the capability exists and is enabled, but setup or auth is incomplete

## Capability truth sources

Use these in order:

1. `openclaw gateway call tools.catalog --json`
2. `openclaw plugins list`
3. `openclaw skills list`
4. `openclaw channels status --probe`
5. `openclaw devices list`
6. `openclaw approvals get --gateway`

## Current audited runtime shape

- The runtime build includes the WhatsApp plugin.
- The runtime build includes the bundled `gog` skill and it is currently ready.
- The secure runtime config currently enables WhatsApp config and `gog`.
- The current secure runtime originally used `tools.profile: "minimal"` plus `tools.allow`.

## Root cause of the thin-shell behavior

The current secure overlay used:

```json5
{
  tools: {
    profile: "minimal",
    allow: ["group:web", "group:fs", "exec", "process", "browser"],
  },
}
```

That looks additive, but it is not.

Repo-verified behavior:

- `tools.profile` is applied first.
- `tools.allow` is then applied as another allow-only filter.
- With `profile: "minimal"`, the profile stage reduces the tool set to `session_status`.
- Later `tools.allow` cannot re-add removed tools.

That is why the live agent could honestly report only `session_status` even while:

- `tools.catalog` exposed richer core tools
- the WhatsApp plugin was loaded
- the `gog` skill was ready

The secure overlays must use `tools.alsoAllow` instead when they start from `minimal`.

## Correct operator interpretation

### Tools

- unavailable:
  - tool or group missing from `openclaw gateway call tools.catalog --json`
  - assistant should say: `This runtime does not expose <tool> in the current build/catalog.`
- disabled:
  - tool exists in catalog but is absent from the agent's effective prompt because of `tools.profile`, `tools.alsoAllow`, `tools.deny`, sandbox policy, owner-only policy, or provider/model gating
  - assistant should say: `This runtime has <tool>, but current policy/session gating does not allow it in this turn.`
- misconfigured:
  - tool exists and policy should allow it, but a dependency or auth path is broken
  - assistant should say: `This runtime should have <tool>, but it is currently misconfigured.`

### Plugins

- unavailable:
  - plugin absent from `openclaw plugins list`
- disabled:
  - plugin appears with `disabled`
- loaded:
  - plugin appears with `loaded`
- invalid or broken:
  - plugin list/status or gateway logs show load failure or compatibility issue

### Skills

- ready:
  - `openclaw skills list` shows `ready`
- blocked:
  - skill exists but policy blocks it
- missing requirements:
  - skill exists but required binaries, auth, or environment are missing

### Channels

- unavailable:
  - channel plugin absent or disabled
- disabled:
  - plugin exists, but channel config not enabled
- misconfigured:
  - `channels status --probe` shows auth, secret, membership, or login issues
- ready:
  - configured, linked where applicable, running, connected, and passes probe/smoke checks

## Recommended secure runtime policy

Use:

```json5
{
  tools: {
    profile: "minimal",
    alsoAllow: [
      "group:web",
      "group:memory",
      "group:fs",
      "exec",
      "process",
      "sessions_list",
      "sessions_history",
      "sessions_send",
      "sessions_spawn",
      "browser",
    ],
    deny: ["gateway", "message", "canvas"],
  },
}
```

This keeps the secure baseline readable while exposing the remote-operator surfaces the runtime actually needs.
