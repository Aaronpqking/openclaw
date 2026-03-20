# V1.1 Topology Decision

## Chosen pattern

Chosen pattern: **PATTERN B**.

- nginx moves to the host for V1.1.
- OpenClaw stays containerized.
- OpenClaw runs with `network_mode: host` and binds `127.0.0.1:18789`.
- `gateway.trustedProxies` stays loopback-only because OpenClaw sees the proxy as `127.0.0.1` or `::1`.

## Why PATTERN B is safer

PATTERN B has the strongest and least ambiguous proxy trust boundary available in this repo:

1. `gateway.trustedProxies` can remain exact loopback addresses instead of a Docker bridge IP or subnet.
2. OpenClaw is still not reachable on any host or public interface because it binds loopback only.
3. The operator can reason about the trust path without depending on Docker bridge addressing, static container IP assignment, or a trusted container CIDR.
4. The same shape migrates cleanly to a future physical Linux host: host nginx, host Tailscale, OpenClaw on host loopback, durable state on host-mounted paths.

This is also the strongest fit for OpenClaw's documented reverse-proxy model. The repo explicitly allows `trusted-proxy` with `bind=loopback` when `gateway.trustedProxies` includes loopback.

## Why PATTERN A is rejected

PATTERN A would keep nginx containerized and trust a Docker bridge source. That is weaker for this deployment because:

1. Proxy identity becomes coupled to container networking instead of a host-local boundary.
2. Trust often expands from one exact endpoint to a bridge IP or CIDR, which is harder to reason about and easier to misconfigure.
3. Static container IP assumptions are brittle across compose edits, host moves, and recovery events.
4. The resulting trust boundary is less clear for a future physical-host migration.

PATTERN A can be made workable, but it is not the lowest-risk secure diff.

## Important residual assumption

OpenClaw does not expose a Unix socket listener for the Gateway HTTP server in this repo. For same-host proxying, loopback is the narrowest supported transport.

That means V1.1 still assumes the host itself is a trusted boundary. A hostile local user or process with access to `127.0.0.1:18789` could spoof proxy headers. This deployment is therefore appropriate for:

- a dedicated VPS
- a dedicated physical host
- one trusted operator boundary per host

It is not a hostile multi-tenant host design.
