# Trusted Proxy Topology

## Request path

V1.1 request path:

`remote browser -> Tailscale HTTPS -> host nginx 127.0.0.1:8080 -> host auth subrequest -> OpenClaw 127.0.0.1:18789`

Reference host auth pattern:

- nginx on host
- identity-aware auth helper on host, for example oauth2-proxy on `127.0.0.1:4180`
- OpenClaw container in host network mode, binding only `127.0.0.1:18789`

## What source IP OpenClaw sees

OpenClaw sees the immediate TCP peer as:

- `127.0.0.1`
- or `::1`

That is why `gateway.trustedProxies` is loopback-only in V1.1.

## Why `trustedProxies` is correct

The V1.1 fragment trusts only:

- `127.0.0.1`
- `::1`

That matches the actual proxy hop when host nginx connects to the loopback-bound OpenClaw listener.

This is technically coherent because:

1. OpenClaw binds loopback only.
2. nginx runs on the same host.
3. nginx overwrites forwarding headers before proxying.
4. OpenClaw checks both proxy source IP and required headers.

## What would break trust

Trust becomes invalid if any of these change without updating the config:

1. nginx moves back into a separate Docker network namespace while `trustedProxies` remains loopback-only.
2. OpenClaw is published on a non-loopback host interface.
3. nginx preserves or appends untrusted `X-Forwarded-*` headers instead of overwriting them.
4. A hostile local user or process is allowed to connect to `127.0.0.1:18789` and inject trusted-proxy headers.
5. The host stops being a single trusted operator boundary.

## How to test the trust boundary

### Listener shape

Verify only loopback listeners exist:

```bash
ss -ltnp | rg '(:8080|:18789)'
```

Expected:

- nginx on `127.0.0.1:8080`
- OpenClaw on `127.0.0.1:18789`
- no LAN/public listener for either service

### Direct-access negative test

From a second host on the same network or tailnet, direct access to OpenClaw should fail:

```bash
curl -v http://<host-ip>:18789/
```

Expected:

- connection refused or no route

### Proxy-header negative test at nginx

An untrusted client must not be able to smuggle auth headers through nginx:

```bash
curl -I \
  -H 'X-Auth-Request-Email: attacker@example.com' \
  -H 'X-Forwarded-For: 1.2.3.4' \
  http://127.0.0.1:8080/
```

Expected:

- `302` to sign-in or `401`
- not an authenticated OpenClaw response

### OpenClaw trusted-proxy negative test

Without the required proxy headers, loopback access to OpenClaw must fail:

```bash
curl -I http://127.0.0.1:18789/
```

Expected:

- unauthorized response

### Important limitation

Do **not** treat same-host header spoofing as an adversarial-user negative test. In this topology, the host itself is a trusted boundary. A hostile local process on the same host can potentially reach the loopback listener and spoof proxy headers. That is a residual risk of the supported loopback transport model and one reason this design expects a dedicated host.
