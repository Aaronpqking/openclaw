# Tools and Skills Policy

This policy pack defines an explicit runtime role split:

- ingress runtime: hardened, non-operator, no Gog
- operator runtime: heartbeat + Gog + approval-aware exec

Ingress fragment:

- `deploy/secure/openclaw/tools-skills.zero-trust.fragment.json`

Operator fragment:

- `deploy/secure/openclaw/whatsapp-coding.fragment.json`

## Ingress runtime posture

- `tools.profile: "minimal"` starts from `session_status` only.
- `tools.alsoAllow` is restricted to ingress operations (`group:web`, `browser`, `nodes`, `cron`).
- `tools.deny` blocks mutation-heavy surfaces (`group:fs`, `group:runtime`, `canvas`, `gateway`).
- `agents.defaults.heartbeat.every = 0m` and `target = none` keeps ingress non-operator.
- `skills.allowBundled: []` keeps Gog disabled.
- `browser.evaluateEnabled: false` disables browser JS eval and `wait --fn`.
- `commands.nativeSkills: false` disables native skill command registration.
- `commands.bash`, `commands.config`, `commands.mcp`, `commands.plugins`, `commands.debug`, and `commands.restart` stay off.
- `skills.load.extraDirs: []` and `skills.load.watch: false` remove extra skill roots and live skill refresh.

Ingress runtime is never evaluated as operator-green.

## Operator runtime posture

The operator fragment is the source of truth for operator behavior:

- heartbeat enabled at `2h`
- heartbeat outbound destination is WhatsApp only; gateway receives indicator/event visibility only
- Gog skill enabled
- exec baseline fixed to `host=gateway`, `security=allowlist`, `ask=on-miss`
- strict green gate: partial status is never promoted to green

## What this policy does not bypass

- It does not replace `agents.list`, so per-agent least-privilege splits remain an operator step.
- It does not disable managed or workspace skills globally. OpenClaw only exposes a bundled-skill allowlist; `~/.openclaw/skills` and `<workspace>/skills` remain a residual risk.
- It does not bypass exec approvals for Gog. Gog remains approval-aware via allowlist + on-miss.
- It does not set `plugins.allow` because unknown plugin ids are validation errors, and install-on-demand plugins such as WhatsApp may not be present yet.
- `tools.elevated` only changes exec placement when the agent is sandboxed; it is not a replacement for gateway or node exec approvals.

## Gog approval persistence (operator runtime)

Use allowlist + on-miss as the baseline, then persist only safe Gog patterns via allow-always once approved.

Safe-to-persist examples:

- `gog auth list`
- `gog gmail labels`
- `gog gmail search ... --max <bounded>`
- `gog calendar events ... --max <bounded>`
- `gog drive list ... --max <bounded>`

Do not persist broad or opaque wrappers:

- shell wrappers (`sh -c`, chained scripts, unknown binaries)
- commands with unbounded result expansion
- commands that include unrelated binary execution

Storage and audit path:

- approvals file: `~/.openclaw/exec-approvals.json`
- audit context: allowlist entry metadata (`lastUsedAt`, `lastUsedCommand`, `lastResolvedPath`)

Revocation path:

```bash
openclaw approvals allowlist remove --gateway "/absolute/path/or-pattern"
```

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

Secure compose defaults skip compiling and installing `gog` (`OPENCLAW_BUILD_GOG=0`, `OPENCLAW_INSTALL_GOG=0`) to keep Docker builds small. Set both to `1` on the operator runtime only. Browser runtime is **off** by default in secure compose (`OPENCLAW_INSTALL_BROWSER=0`) so image builds avoid apt + Playwright Chromium; set `OPENCLAW_INSTALL_BROWSER=1` only where needed.

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
