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
export GROQ_API_KEY='replace-me'
export DEEPSEEK_API_KEY='replace-me'
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

## Patch deployment without building Docker images

The gateway **reads config from the host** via bind mounts (`~/.openclaw` → `/home/node/.openclaw`). You can change behavior **without** rebuilding the image:

1. **Edit runtime files on the gateway host** (SSH as the deploy user, often `root`):
   - `~/.openclaw/openclaw.json` — models, channels, agents, etc.
   - `~/.openclaw/secure-mvp.env` — gateway auth and provider API keys (mode `0600`).
2. **Restart only the OpenClaw container** so it reloads mounted files:
   ```bash
   ssh user@host 'docker compose -f ~/openclaw/deploy/secure/docker-compose.secure.yml restart openclaw'
   ```
   Or from the host with the same `HOME` and checkout path Compose expects:
   ```bash
   cd ~/openclaw/deploy/secure && HOME=$HOME docker compose -f docker-compose.secure.yml restart openclaw
   ```

**Sync repo + compose up without a rebuild** (image `openclaw:secure-mvp` must already exist on the host):

```bash
deploy/secure/scripts/remote-sync.sh user@host
ssh user@host 'cd ~/openclaw/deploy/secure && HOME=$HOME docker compose -f docker-compose.secure.yml up -d --no-build'
```

Or one shot after exporting gateway credentials locally:

```bash
deploy/secure/scripts/remote-mvp-up.sh --no-build user@host
```

That still rewrites `secure-mvp.env` from your local exports and runs `tailscale serve`; it does **not** run `docker compose build`.

**Nginx-only changes** (e.g. `deploy/secure/nginx/openclaw.conf`): sync the repo, then `docker compose up -d --no-build` so `nginx` reloads config from the bind mount.

## Config snapshots and diff (recovery)

After a bad `config.set`, `~/.openclaw/logs/config-audit.jsonl` records **`previousHash`** / **`nextHash`** (and byte sizes) for each write. The **best rollback checkpoint** is the file whose SHA-256 matches **`previousHash`** from the bad event (state immediately before that write). Post-incident copies may be saved as `openclaw.json.before-revert.*` on the host; compare them to the live file before restoring anything.

From the operator machine (or on the host with Node installed):

```bash
node deploy/secure/scripts/compare-openclaw-config.mjs \
  ~/.openclaw/openclaw.json.before-revert.YOURTIMESTAMP \
  ~/.openclaw/openclaw.json
```

Use `--no-redact` only on a trusted host when you need exact values. If the preimage file is gone from the gateway host, search backups (provider snapshots, off-host `rsync`, object storage) for a matching hash.

## Notes

- This path is for the secure MVP stack, not the V1.1 host-nginx topology.
- V1.1 is still better activated directly on the Linux host after the MVP remote path is stable.
- Durable state stays on the host in `~/.openclaw`, which keeps later migration to a physical machine straightforward.
- Secure runtime memory/reference file (image, network, health, reconnect evidence commands):
  - `deploy/secure/docs/SECURE_VM_RUNTIME_REFERENCE.env`
