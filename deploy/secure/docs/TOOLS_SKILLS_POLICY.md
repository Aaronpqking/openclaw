# Tools and Skills Policy

This policy pack adds the enforceable subset of the WhatsApp-oriented zero-trust model without clobbering an existing `agents.list`.

Primary fragment:

- `deploy/secure/openclaw/tools-skills.zero-trust.fragment.json`

Optional WhatsApp + coding overlay:

- `deploy/secure/openclaw/whatsapp-coding.fragment.json`

## What the fragment enforces

- `tools.profile: "minimal"` starts from `session_status` only.
- `tools.alsoAllow` adds reviewed tools on top of the `minimal` profile without collapsing the toolset to `session_status`.
- `tools.deny` in the zero-trust fragment blocks `group:fs`, `group:runtime`, `canvas`, and `gateway` (it does **not** deny `message`, so you can combine overlays that allow WhatsApp sends). The WhatsApp overlay additionally denies `gateway` and `canvas` while keeping `message` available for allowlisted operators.
- `browser.evaluateEnabled: false` disables browser JS eval and `wait --fn`.
- `commands.nativeSkills: false` disables native skill command registration.
- `commands.bash`, `commands.config`, `commands.mcp`, `commands.plugins`, `commands.debug`, and `commands.restart` stay off.
- `skills.allowBundled: []` blocks bundled skills by default.
- `skills.load.extraDirs: []` and `skills.load.watch: false` remove extra skill roots and live skill refresh.

## What it does not enforce

- It does not replace `agents.list`, so per-agent least-privilege splits remain an operator step.
- It does not disable managed or workspace skills globally. OpenClaw only exposes a bundled-skill allowlist; `~/.openclaw/skills` and `<workspace>/skills` remain a residual risk.
- It does not hard-split `gog` into read-only versus write-capable operations. That still needs approvals and process controls.
- It does not set `plugins.allow` because unknown plugin ids are validation errors, and install-on-demand plugins such as WhatsApp may not be present yet.
- `tools.elevated` only changes exec placement when the agent is sandboxed; it is not a replacement for gateway or node exec approvals.

## Optional WhatsApp channel policy

Use `deploy/secure/openclaw/whatsapp-coding.fragment.json` if you want a ready-made placeholder for:

- WhatsApp owner-only inbound
- coding-oriented file, memory, and exec tools
- browser access
- `gog` skill enablement
- a tool policy that actually composes with `tools.profile: "minimal"`

Important:

- `tools.allow` is an allow-only filter applied after `tools.profile`.
- If you start from `tools.profile: "minimal"`, then `tools.allow` cannot re-add tools that the profile already removed.
- Use `tools.alsoAllow` for additive enablement on top of a profile, or switch to `tools.profile: "coding"` if you want the full coding baseline.

If you prefer to merge the WhatsApp block by hand, apply it only after the WhatsApp plugin is installed, because unknown `channels.whatsapp` config is a validation error before plugin discovery:

```json5
{
  channels: {
    whatsapp: {
      dmPolicy: "allowlist",
      allowFrom: ["+15551234567"],
      groupPolicy: "allowlist",
      groupAllowFrom: ["+15551234567"],
      groups: {
        "*": { requireMention: true },
      },
    },
  },
}
```

If you want chat commands stricter than the normal channel allowlist, add:

```json5
{
  commands: {
    allowFrom: {
      whatsapp: ["+15551234567"],
    },
  },
}
```

## Optional skill enables

Start with no bundled skills. Add only the exact bundled skills you intend to trust:

```json5
{
  skills: {
    allowBundled: ["gog"],
    entries: {
      gog: { enabled: true },
    },
  },
}
```

Examples:

- `["gog"]` for Google Workspace CLI access
- `["wacli"]` if you intentionally want the WhatsApp CLI skill
- `["peekaboo"]` only if the host really needs screenshot capture

The secure MVP compose now bakes `gog` into the secure image by default. Browser runtime is also enabled by default in secure compose (`OPENCLAW_INSTALL_BROWSER=1`) so browser tools work immediately; set `OPENCLAW_INSTALL_BROWSER=0` when disk-constrained hosts need a smaller image.

Do not enable marketplace or third-party skills in production until they are reviewed.

## Optional per-agent split

If you want the stricter `research` / `operator` / `scheduler` split, define it in your live `agents.list` rather than merging an example fragment that would overwrite the whole array.

Suggested shape:

- `research`: allow only `group:web`
- `operator`: add `browser`, `nodes`, and explicitly approved mutation paths
- `scheduler`: add `cron`, keep `browser` and `nodes` denied

## Approvals path for mutations

Use exec approvals for gateway and nodes instead of widening tool policy:

```bash
openclaw approvals get --gateway
openclaw approvals set --gateway --file ./exec-approvals.json
openclaw approvals get --node <id>
openclaw approvals set --node <id> --file ./exec-approvals.json
```
