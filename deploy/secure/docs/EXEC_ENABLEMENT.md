# Exec Enablement

This secure path enables `exec` and `process` without exposing OpenClaw directly on a public interface.

## Trust model

- single trusted operator
- remote access only through Tailscale to loopback nginx
- no `docker.sock` mount
- durable state on host-mounted OpenClaw paths
- destructive execution remains approval-gated

## Repo-verified runtime facts

- `exec` and `process` are core tools in the runtime catalog
- `apply_patch` is allowed only when `exec` is allowed and the model/provider path supports it
- `tools.profile: "minimal"` must be paired with `tools.alsoAllow`, not `tools.allow`, if you want additive tool enablement

## Recommended secure config

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
  browser: {
    evaluateEnabled: false,
    ssrfPolicy: {
      dangerouslyAllowPrivateNetwork: false,
    },
  },
}
```

## Exec approvals baseline

Start with gateway approvals present even for a single-user deployment:

```bash
openclaw approvals get --gateway
```

Suggested baseline:

- leave `defaults.ask` on or `on-miss`
- allowlist exact low-risk read/diagnostic binaries first
- do not allowlist package managers, docker lifecycle commands, chmod/chown, or broad shells by default

Example commands:

```bash
openclaw approvals allowlist add --gateway "/usr/bin/env"
openclaw approvals allowlist add --gateway "/usr/bin/printf"
openclaw approvals allowlist add --gateway "/bin/ls"
openclaw approvals allowlist add --gateway "/bin/cat"
openclaw approvals allowlist add --gateway "/usr/bin/find"
openclaw approvals allowlist add --gateway "/usr/bin/grep"
openclaw approvals allowlist add --gateway "/usr/bin/git"
openclaw approvals allowlist add --gateway "/usr/bin/openclaw"
```

Tune these to the actual host paths before using them in production.

## Validation

```bash
openclaw gateway call tools.catalog --json
openclaw approvals get --gateway
openclaw config get tools --json
openclaw agent --agent main --message "List your tool names only." --thinking minimal --timeout 90 --json
```

Expected result after the `alsoAllow` fix:

- `systemPromptReport.tools.entries` includes `exec` and `process`
- filesystem read/write tools appear if `group:fs` is present
- browser appears if `browser` is present

If the report still shows only `session_status`, the runtime is still using the wrong policy shape or an older image.

## Optional browser runtime on VPS

If Eleanor needs managed browser automation in the deployed secure environment, enable browser baking at image build time.

```bash
export OPENCLAW_INSTALL_BROWSER=1
docker compose -f deploy/secure/docker-compose.v1_1.yml build openclaw
docker compose -f deploy/secure/docker-compose.v1_1.yml up -d openclaw
```

Verify Chromium is present in the running container:

```bash
docker compose -f deploy/secure/docker-compose.v1_1.yml exec openclaw sh -lc 'chromium --version || google-chrome --version'
```

Verify Playwright browser assets were installed:

```bash
docker compose -f deploy/secure/docker-compose.v1_1.yml exec openclaw sh -lc 'ls -la /home/node/.cache/ms-playwright'
```
