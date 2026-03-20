# Firewall Scaffold

This directory contains a Linux nftables scaffold for the secure OpenClaw deployment.

## Scope

- It is meant for a dedicated Linux VPS or future physical Linux host.
- It is not meant for Docker Desktop on macOS or Windows.
- It is not safe to apply unchanged.

## Why host firewalling matters here

- MVP uses Docker bridge networking for nginx and OpenClaw.
- V1.1 uses host nginx plus an OpenClaw container in host network mode.
- In both cases, Docker Compose is not a real egress-policy engine.
- For V1.1 especially, host-level firewalling is the correct control point.

## Files

- `example-nftables.conf`: deny-by-default scaffold with placeholder destination sets

## Operator workflow

1. Replace all placeholder addresses and interfaces.
2. Populate DNS, provider, maintenance, and observability destination sets.
3. Decide how Tailscale control/data-plane traffic will be allowed before enforcing default-deny egress.
4. Load the ruleset only during a maintenance window:

```bash
sudo nft -f deploy/secure/firewall/example-nftables.conf
sudo nft list ruleset
```

5. Re-test:

```bash
docker compose -f deploy/secure/docker-compose.v1_1.yml config
curl -fsS http://127.0.0.1:18789/healthz
curl -fsS http://127.0.0.1:8080/healthz
tailscale serve status
openclaw security audit --deep
```

## Important limitation

For V1.1, exact Tailscale and CDN-backed provider pinning cannot be finished from this repo alone. The nftables file is scaffolding and must be finalized with operator-specific endpoint data.
