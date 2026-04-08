# WhatsApp recovery runtime (fresh home)

Use when the active `~/.openclaw` tree is contaminated but you must keep **Baileys / WhatsApp credentials** and restore **config invariants** without Control UI `config.set`.

## Prepared on host (example)

Replace `/root` with the deploy user’s home if production uses a non-root `HOME` (see `resolve-openclaw-host-home.sh`).

| Item                         | Path                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| **Fresh runtime home**       | `${OPENCLAW_HOST_HOME}/.openclaw-recovery` (example: `/root/.openclaw-recovery`)   |
| **Restored config source**   | `${OPENCLAW_HOST_HOME}/.openclaw/openclaw.json.bak` (read-only input to bootstrap) |
| **Generated config**         | `${RECOVERY_HOME}/openclaw.json`                                                   |
| **Cron (all jobs disabled)** | `${RECOVERY_HOME}/cron/jobs.json`                                                  |
| **Credentials copy**         | `${RECOVERY_HOME}/credentials/` (from legacy)                                      |
| **Env file copy**            | `${RECOVERY_HOME}/secure-mvp.env` (from legacy)                                    |

Bootstrap script: `deploy/secure/scripts/bootstrap-whatsapp-recovery-home.mjs`  
Host wrapper: `deploy/secure/scripts/prepare-recovery-runtime.sh`

## Re-run preparation

```bash
eval "$(./deploy/secure/scripts/resolve-openclaw-host-home.sh)"   # or set OPENCLAW_HOST_HOME / RECOVERY_HOME / LEGACY_HOME by hand
export LEGACY_HOME="${OPENCLAW_HOST_HOME}/.openclaw"
export RECOVERY_HOME="${RECOVERY_HOME:-${OPENCLAW_HOST_HOME}/.openclaw-recovery}"
export OPENCLAW_IMAGE=openclaw:secure-mvp
chmod +x deploy/secure/scripts/prepare-recovery-runtime.sh
./deploy/secure/scripts/prepare-recovery-runtime.sh ./deploy/secure/scripts/bootstrap-whatsapp-recovery-home.mjs
```

## Parallel recovery gateway (preferred; no blind cutover)

**Do not** replace the primary `openclaw` service until probes pass. Run a **second** service (`openclaw-recovery`) with its **own** host bind (`RECOVERY_HOME`). Never run two active containers **read-write** on the same runtime home.

### 1) Resolve the host home (not always `/root`)

The base compose file uses `${HOME}/.openclaw` on the **host**. Discover the real path from the running primary container:

```bash
cd /path/to/openclaw/deploy/secure
eval "$(./scripts/resolve-openclaw-host-home.sh)"
# Sets OPENCLAW_HOST_HOME and RECOVERY_HOME (default: ${OPENCLAW_HOST_HOME}/.openclaw-recovery)
```

Override `RECOVERY_HOME` if your prepared tree lives elsewhere. Prepare that tree with `prepare-recovery-runtime.sh` before bring-up.

### 2) Bring up only the recovery service

Does **not** stop or recreate `openclaw` or `nginx`.

```bash
export HOME="${OPENCLAW_HOST_HOME}"
docker compose -f docker-compose.secure.yml -f docker-compose.recovery-parallel.yml up -d openclaw-recovery
```

Recovery listens on the host at **`127.0.0.1:${OPENCLAW_RECOVERY_HOST_PORT:-18790}`** (maps to container `18789`). Primary keeps using its existing port mapping (if any).

### 3) Automated probes (recovery)

```bash
chmod +x ./scripts/probe-recovery-gateway.sh
RECOVERY_PORT="${OPENCLAW_RECOVERY_HOST_PORT:-18790}" ./scripts/probe-recovery-gateway.sh
```

### 4) Manual validation gate (must pass before promotion)

1. WhatsApp **linked/healthy** in probe output.
2. **Sender A** inbound → exactly **one** correct reply; no duplicate within 30s.
3. **Sender B** inbound → same; **no cross-talk** between A and B.
4. No **echo** / duplicate outbound, no **`Channel is required`** in logs for those turns.
5. **Cron:** no job still **enabled** that targets a shared `agent:main:main` session for WhatsApp (recovery should have all jobs disabled; confirm in `cron/jobs.json`).
6. No **stale external routing** from operator/web chat (exercise web chat only if you can isolate it from WhatsApp routing during the test window).

Record sender identifiers in operator notes (not in this repo).

### 5) Promote recovery to primary (only after all gates pass)

**Exact cutover** (stops parallel recovery, then recreates primary + nginx with `RECOVERY_HOME`):

```bash
cd /path/to/openclaw/deploy/secure
eval "$(./scripts/resolve-openclaw-host-home.sh)"
export HOME="${OPENCLAW_HOST_HOME}"
chmod +x ./scripts/promote-recovery-to-primary.sh
./scripts/promote-recovery-to-primary.sh
```

Equivalent manual `docker compose` (same effect):

```bash
eval "$(./scripts/resolve-openclaw-host-home.sh)"
export HOME="${OPENCLAW_HOST_HOME}"
docker compose -f docker-compose.secure.yml -f docker-compose.recovery-parallel.yml stop openclaw-recovery
docker compose -f docker-compose.secure.yml -f docker-compose.recovery-parallel.yml rm -f openclaw-recovery
docker compose -f docker-compose.secure.yml -f docker-compose.recovery.override.yml up -d --force-recreate openclaw nginx
```

The legacy tree at `${HOME}/.openclaw` stays on disk for forensics; the **running** primary container now binds `${RECOVERY_HOME}`.

### If probes fail

Leave the primary `openclaw` service untouched; stop only the recovery service and capture logs:

```bash
docker compose -f docker-compose.secure.yml -f docker-compose.recovery-parallel.yml stop openclaw-recovery
docker logs secure-openclaw-recovery-1 2>&1 | tail -n 200
```

## Blind cutover (not recommended)

Only if you intentionally skip parallel validation (higher risk of wrong-recipient / echo / cross-talk):

```bash
cd /path/to/openclaw/deploy/secure
export HOME=<host home for deploy user>
export RECOVERY_HOME=<prepared recovery home>
docker compose -f docker-compose.secure.yml -f docker-compose.recovery.override.yml up -d
```

## Cron confirmation

Recovery `cron/jobs.json` has **`enabled: false`** on **all** jobs (including any that targeted `session:agent:main:main` with WhatsApp delivery). Re-enable later only after WhatsApp is stable and you intentionally restore schedules.

## Do not

- Use Control UI form save / `config.set` during recovery.
- Edit the **legacy** `${OPENCLAW_HOST_HOME}/.openclaw` tree for fixes while the recovery stack is live (forensics only).
