# Remote MVP Deploy

## Why this path exists

The secure MVP compose file uses bind mounts for host state and nginx config. That means a plain remote Docker context is not enough on its own, because bind mounts resolve on the Docker daemon host, not on the client machine.

For this secure path, the safe remote workflow is:

1. sync the repo to the VPS
2. run Docker Compose on the VPS over SSH
3. keep Tailscale Serve on the VPS

This preserves the current secure deployment design and avoids local Docker Desktop instability.

## Remote host prerequisites

- Linux host with Docker Engine and Docker Compose plugin
- Tailscale installed, signed in, and healthy
- SSH access to the host
- enough disk for the OpenClaw image build and `~/.openclaw`

## MVP deploy

Set one of these locally first:

```bash
export OPENCLAW_GATEWAY_TOKEN='replace-me'
export OPENCLAW_GATEWAY_PASSWORD='replace-me'
```

Optional model provider keys:

```bash
export OPENAI_API_KEY='replace-me'
export GEMINI_API_KEY='replace-me'
```

Sync and deploy:

```bash
deploy/secure/scripts/remote-mvp-up.sh user@host
```

Optional custom checkout path on the VPS:

```bash
deploy/secure/scripts/remote-mvp-up.sh user@host /srv/openclaw
```

What the script does:

- syncs the current checkout to the remote host with `rsync`
- creates remote `~/.openclaw` and `~/.openclaw/workspace`
- writes or updates remote `~/.openclaw/secure-mvp.env`
- validates `deploy/secure/docker-compose.secure.yml`
- runs `docker compose up -d --build` on the host
- enables `tailscale serve --bg --https=443 http://127.0.0.1:8080`

## Verify

```bash
ssh user@host 'docker ps --format "table {{.Names}}\t{{.Status}}"'
ssh user@host 'curl -fsS http://127.0.0.1:8080/healthz'
ssh user@host 'curl -fsS http://127.0.0.1:8080/readyz'
ssh user@host 'tailscale serve status'
```

If you need the direct OpenClaw health endpoint on the host:

```bash
ssh user@host 'curl -fsS http://127.0.0.1:18789/healthz'
```

## Notes

- This path is for the secure MVP stack, not the V1.1 host-nginx topology.
- V1.1 is still better activated directly on the Linux host after the MVP remote path is stable.
- Durable state stays on the host in `~/.openclaw`, which keeps later migration to a physical machine straightforward.
