# Egress Control Plan

## Scope

Docker Compose is not a real egress-policy engine. For OpenClaw, especially the V1.1 host-network path, outbound control must be enforced at the host layer or via a dedicated outbound proxy.

This file is scaffolding, not a turnkey policy.

## Baseline model

1. Use a dedicated VPS or physical host for one OpenClaw trust boundary.
2. Treat outbound network as deny-by-default after bootstrap.
3. Re-open package and image sources only during planned maintenance windows.
4. Restrict provider/API access to the exact services you intentionally use.
5. Keep observability egress disabled unless intentionally enabled.

## Required allowlist categories

### Tailscale control/data plane

Needed for:

- tailnet control-plane enrollment
- DERP relay fallback
- NAT traversal and peer connectivity

Important caveat:

- Tailscale endpoints are dynamic and are not safely pinnable in this repo without operator-specific endpoint automation or a dedicated upstream egress proxy.
- If you apply host-wide default-deny egress, you must plan how `tailscaled` will keep working before turning enforcement on.

Recommended practice:

- keep Tailscale on the same dedicated host
- explicitly inventory its current destinations before enforcement
- prefer a dedicated outbound proxy or dynamic nftables set refresh if you need very strict pinning

### DNS

Allow only the resolver IPs you actually use:

- VPS provider resolver
- internal resolver
- chosen public resolvers

Do not leave DNS fully open.

### Package/image fetch during maintenance windows only

Examples:

- OS package mirrors
- Docker registries
- Git hosting
- npm registry

These destinations are usually CDN-backed and may change. Keep them disabled during normal runtime and open them only during patch/update windows.

### Model/API providers actually used

Populate only the providers you operate with. Examples:

- Anthropic
- OpenAI
- Google
- OpenRouter
- Perplexity
- self-hosted provider endpoints

Do not allow generic outbound `443` to the whole internet as a permanent rule.

### Optional observability endpoints

Allow only if intentionally enabled:

- OTLP collector
- log forwarder
- metrics sink

The repo includes optional diagnostics/OTel surfaces, but they should stay off by default in production.

## What cannot be pinned safely yet without operator input

- exact Tailscale control/DERP endpoints
- CDN-backed package registries
- Docker Hub/GHCR edge IPs
- npm registry edge IPs
- provider IPs behind CDN/load-balancing
- any plugin marketplace or Git source

Those need operator-selected destinations, dynamic set generation, or an explicit outbound proxy architecture.

## Practical enforcement sequence

1. Inventory current outbound destinations from the dedicated host during a normal admin session.
2. Decide which providers are truly required.
3. Build nftables sets for DNS, providers, observability, and maintenance sources.
4. Enforce default-deny egress only after the allowlists are populated.
5. Keep update destinations disabled outside maintenance windows.
6. Re-test Tailscale, proxy auth, health endpoints, WebSocket control, and model calls after every firewall change.

## Recommended control point

For Linux VPS and physical-host deployments, use host nftables. If you later want tighter domain-aware egress control than raw IP sets can provide, put OpenClaw behind a dedicated outbound proxy and restrict direct egress to that proxy only.
