# Operator Runtime Split

## Decision

Use split runtimes:

- ingress runtime: hardened ingress only
- operator runtime: heartbeat + Gog + approvals

Do not treat ingress runtime as operator-green.

## Runtime roles

### Ingress runtime

- Purpose: inbound transport, access control, reverse-proxy-safe surfaces.
- Tools: minimal plus ingress-safe controls only.
- Skills: Gog disabled.
- Heartbeat: disabled (`every=0m`, `target=none`).
- Exec: not used for operator workflows.
- Status: never reported as operator-green.

### Operator runtime

- Purpose: autonomous operator workflow execution.
- Tools: includes `exec`, `process`, memory/session tools, browser as needed.
- Skills: Gog enabled.
- Heartbeat: enabled at `2h`; sends to WhatsApp and emits gateway indicator events.
- Exec baseline: `host=gateway`, `security=allowlist`, `ask=on-miss`.
- Green policy: strict; any failed critical gate blocks green.

## Gog approval strategy

Baseline:

- `allowlist + on-miss`
- first safe Gog command may be approved as allow-always
- repeated matching commands should not re-prompt

Safe patterns to persist:

- bounded read queries and explicit Gog subcommands
- direct Gog invocation (no generic shell wrappers)

Do not persist:

- wrapper chains (`sh -c`, arbitrary scripts)
- unbounded or opaque commands
- commands that execute non-Gog binaries

Storage/audit:

- `~/.openclaw/exec-approvals.json`
- allowlist metadata in the same file (`lastUsedAt`, `lastUsedCommand`, `lastResolvedPath`)

Revocation:

```bash
openclaw approvals allowlist remove --gateway "<pattern>"
```

## Strict green gates

All must pass:

1. runtime active
2. scheduler tick observed
3. heartbeat executed in fresh window
4. provider auth valid
5. heartbeat resolves non-none destination
6. outbound delivery confirmed
7. Gog installed
8. Gog enabled
9. Gog exec succeeds through approval/allowlist path
10. repeated approved Gog command does not re-prompt

If any critical gate fails, final status is not green.

## Disk-safe SVM update path

Prefer low-churn updates in this order:

1. git-based update on host (preferred)
2. minimal overlay sync
3. rebuild only if unavoidable

Before any update, collect:

```bash
df -h
du -xh -d 2 /var/lib/docker | sort -h | tail -40
du -xh -d 3 /root/.openclaw | sort -h | tail -80
docker system df -v
```

If headroom is low, remove only positively safe targets:

- dangling images
- stopped containers no longer needed
- obsolete temp artifacts
- superseded hotfix overlays with rollback copies

Never delete:

- active credentials
- current rollback image
- required evidence bundles

Low-churn deploy command pattern:

```bash
docker compose -f <compose> up -d --no-build --pull never --force-recreate <service>
```
