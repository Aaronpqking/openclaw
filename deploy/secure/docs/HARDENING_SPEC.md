# OpenClaw Secure Deployment Path

## Scope

This directory adds a secure deployment path for OpenClaw without changing the repo's existing Docker flow.

Two tracks are maintained:

- MVP: Tailscale-only remote admin, nginx on host loopback exposure through the existing secure compose, CSP `Report-Only`, OpenClaw native auth retained
- V1.1: host nginx plus identity-aware reverse proxy auth, loopback-only trusted proxy config, optional gVisor override, and host-layer egress-control scaffolding

## Verified repo facts

- Gateway port defaults to `18789` in `src/config/paths.ts` and `src/config/types.gateway.ts`.
- Gateway health endpoints include `/healthz` and `/readyz` in `src/gateway/server-http.ts`.
- Non-loopback Control UI requires `gateway.controlUi.allowedOrigins` in `src/gateway/server-runtime-config.ts`.
- `gateway.auth.allowTailscale`, `gateway.trustedProxies`, and `gateway.auth.trustedProxy.*` are valid config keys in `src/config/types.gateway.ts` and `src/gateway/auth.ts`.
- Trusted-proxy auth validates the request source IP first and then requires configured headers in `src/gateway/auth.ts`.
- The repo runtime image includes `curl`, not `wget`, in `Dockerfile`.
- The repo does not expose a Unix-socket Gateway listener for same-host reverse proxying, so loopback is the narrowest supported transport.

## Architecture

MVP traffic flow:

`remote browser -> Tailscale HTTPS -> 127.0.0.1:8080 -> nginx container -> private Docker bridge -> OpenClaw`

V1.1 traffic flow:

`remote browser -> Tailscale HTTPS -> host nginx 127.0.0.1:8080 -> host auth helper -> OpenClaw 127.0.0.1:18789`

OpenClaw is never published directly on a host interface in either path.

## Trust boundaries

1. Tailscale is the remote access boundary.
2. nginx is the reverse-proxy and response-header boundary.
3. In V1.1, the identity-aware auth helper in front of nginx becomes the browser identity boundary.
4. OpenClaw remains the application boundary for health, origin checks, and trusted-proxy enforcement.
5. Host-mounted `~/.openclaw` and `~/.openclaw/workspace` are durable trusted state.
6. Plugins, skills, and marketplaces remain trusted-code surfaces and must be treated as such.

## Tools and skills policy pack

Use `deploy/secure/openclaw/tools-skills.zero-trust.fragment.json` for the merge-safe baseline that hardens:

- command surfaces
- browser JS-eval behavior
- global tool allow/deny policy
- bundled skill allowlist behavior

Operator notes and optional WhatsApp/per-agent overlays are documented in `deploy/secure/docs/TOOLS_SKILLS_POLICY.md`.

## Why loopback is used even when deployed remotely

The deployment is remotely reachable through Tailscale, but ingress lands on host loopback. That keeps OpenClaw off public and LAN-facing interfaces while preserving remote admin access.

For V1.1, loopback also makes the trusted-proxy hop exact and operator-readable.

## Why performance impact is negligible in MVP

The nginx hop is on the same host and only forwards loopback/Tailscale traffic into a local container bridge. For an admin UI and WebSocket control plane, that overhead is negligible relative to network latency and model/tool execution time.

## Why CSP starts as Report-Only

OpenClaw serves a real Control UI and WebSocket client. An enforced CSP can break legitimate UI behavior if the current asset graph needs adjustments. `Report-Only` gives operators an observation phase before enforcement.

The enforced policy is staged in `deploy/secure/csp/csp-enforce.conf` but is not active by default.

### CSP promotion checklist

1. Inspect the current frontend for inline scripts, dynamic imports, workers, and WebSocket usage.
2. Collect and review `Content-Security-Policy-Report-Only` violations under normal operator workflows.
3. Reconcile every legitimate source before tightening the policy.
4. Promote to enforced CSP only after UI, auth redirects, and WebSocket sessions are validated.

## Why trusted-proxy is deferred until V1.1

MVP keeps OpenClaw native auth in place and does not move the browser identity boundary to the proxy. That is the lowest-risk starting point.

V1.1 moves to trusted-proxy only after the topology is changed so `gateway.trustedProxies` is technically correct.

## Remote deployment note

For the MVP stack, a plain remote Docker context is not sufficient by itself because the secure compose file uses bind mounts for nginx config and durable state. Bind mounts resolve on the Docker daemon host, not on the client machine.

Use the remote SSH deployment path in `deploy/secure/docs/REMOTE_DEPLOY.md` instead. It syncs the repo to the Linux host first and then runs the secure compose file there, which keeps the current trust boundaries intact and avoids surprises around missing bind-mounted files.

## V1.1 topology decision

V1.1 uses host nginx rather than a containerized nginx proxy. The separate decision note is in `deploy/secure/docs/V1_1_DECISION.md`.

This is the key trust correction:

- MVP containerized nginx means OpenClaw must bind `lan` internally on the private bridge
- V1.1 host nginx means OpenClaw can bind `loopback` and trust only `127.0.0.1` and `::1`

## gVisor support

gVisor remains optional and isolated to `deploy/secure/gvisor/docker-compose.gvisor.override.yml`.

Prerequisites:

- Linux host
- `runsc` installed
- Docker configured with a `runsc` runtime entry

Enable:

```bash
docker compose \
  -f deploy/secure/docker-compose.v1_1.yml \
  -f deploy/secure/gvisor/docker-compose.gvisor.override.yml \
  up -d --build
```

Disable:

```bash
docker compose -f deploy/secure/docker-compose.v1_1.yml up -d --build
```

Known caveats:

- gVisor can change syscall, filesystem, and networking compatibility
- V1.1 uses host networking for exact loopback proxy trust, so operators must validate their `runsc` host-network behavior before treating it as production-ready
- keep gVisor as an explicit operator choice, not the default path

## Extension and plugin production stance

Production stance for this secure path:

- do not install community plugins, marketplace plugins, or arbitrary npm/path plugins unless explicitly approved
- prefer an explicit `plugins.allow` allowlist for only the plugin IDs you intend to run
- inspect plugin files on disk before enabling any non-bundled plugin
- bundled plugins should stay disabled unless needed
- keep bundled skills deny-by-default and only add exact reviewed skill keys to `skills.allowBundled`
- keep `skills.load.watch=false` on hardened hosts so new local skill files do not silently appear in the next agent turn

Current repo limitation:

- there is no verified global config switch in this repo that disables the plugin marketplace CLI surface entirely
- plugin installs remain an operator-controlled remote-code surface
- there is no verified global config switch in this repo that disables managed or workspace skills entirely; `skills.allowBundled` only governs bundled skills

That is a residual risk and should be addressed operationally:

- dedicated host
- no casual admin shell access
- outbound controls
- documented change approval before plugin installation

## Operator steps

### MVP launch

1. Ensure `~/.openclaw` and `~/.openclaw/workspace` exist on the host.
2. Merge `deploy/secure/openclaw/gateway.mvp.fragment.json` into your OpenClaw config.
3. Merge `deploy/secure/openclaw/tools-skills.zero-trust.fragment.json` into your OpenClaw config.
4. Set `OPENCLAW_GATEWAY_TOKEN` or `OPENCLAW_GATEWAY_PASSWORD`.
5. Start:

```bash
docker compose -f deploy/secure/docker-compose.secure.yml up -d --build
```

6. Verify:

```bash
docker compose -f deploy/secure/docker-compose.secure.yml config
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/readyz
bash deploy/secure/tailscale/serve.sh
tailscale serve status
openclaw security audit --deep
```

### V1.1 launch

1. Keep Tailscale on the host.
2. Install host nginx and your identity-aware auth helper.
3. Copy `deploy/secure/nginx/openclaw.host.v1_1.conf` into the host nginx config and place the CSP files where the config expects them.
4. Merge `deploy/secure/openclaw/gateway.v1_1.fragment.json` into your OpenClaw config.
5. Merge `deploy/secure/openclaw/tools-skills.zero-trust.fragment.json` into your OpenClaw config.
6. Start:

```bash
docker compose -f deploy/secure/docker-compose.v1_1.yml up -d --build
```

7. Verify:

```bash
docker compose -f deploy/secure/docker-compose.v1_1.yml config
curl -fsS http://127.0.0.1:18789/healthz
curl -fsS http://127.0.0.1:8080/healthz
bash deploy/secure/tailscale/serve.sh
tailscale serve status
openclaw security audit --deep
```

## V1.1 validation checklist

1. Compose validation:

```bash
docker compose -f deploy/secure/docker-compose.v1_1.yml config
```

2. Request-path validation:

```bash
ss -ltnp | rg '(:8080|:18789)'
```

3. Health validation:

```bash
curl -fsS http://127.0.0.1:18789/healthz
curl -fsS http://127.0.0.1:8080/healthz
```

4. WebSocket validation:

- sign in through the proxy
- open the Control UI
- confirm the Control UI connects and remains stable

5. Trusted-proxy auth validation:

- approved user reaches the Control UI through nginx
- unapproved user is denied by proxy policy or `allowUsers`

6. Negative test: direct access to OpenClaw should fail from any non-loopback source:

```bash
curl -v http://<host-ip>:18789/
```

7. Negative test: spoofed proxy headers from an untrusted source should fail at nginx:

```bash
curl -I \
  -H 'X-Auth-Request-Email: attacker@example.com' \
  -H 'X-Forwarded-For: 1.2.3.4' \
  http://127.0.0.1:8080/
```

8. gVisor validation:

```bash
docker compose \
  -f deploy/secure/docker-compose.v1_1.yml \
  -f deploy/secure/gvisor/docker-compose.gvisor.override.yml \
  config
docker compose \
  -f deploy/secure/docker-compose.v1_1.yml \
  -f deploy/secure/gvisor/docker-compose.gvisor.override.yml \
  up -d --build
docker exec $(docker ps -qf ancestor=openclaw:secure-v1_1 | head -n 1) dmesg | head
```

## Repo and topology limitations

- OpenClaw does not expose a Unix-socket HTTP listener for the Gateway, so host loopback is the narrowest supported trusted-proxy path.
- Same-host trusted-proxy deployments assume the host itself is trusted.
- V1.1 relies on host nginx and host auth-helper correctness; Compose alone is not enough.
- Host-level egress policy needs operator-populated destinations; this repo can only provide scaffolding.

## Migration notes for a future physical host

This layout remains migration-friendly:

- durable state stays on host-mounted `~/.openclaw`
- workspace stays on host-mounted `~/.openclaw/workspace`
- Tailscale remains host-local
- V1.1 host nginx maps directly onto a physical Linux host

Migration steps:

1. copy `~/.openclaw`
2. copy `~/.openclaw/workspace`
3. copy `deploy/secure/`
4. recreate Docker, host nginx, host auth helper, firewall rules, and Tailscale on the physical host
5. re-run `tailscale serve`
