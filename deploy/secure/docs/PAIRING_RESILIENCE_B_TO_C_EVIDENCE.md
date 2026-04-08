# Pairing Resilience B to C Evidence

Date: 2026-04-06

## Fresh image build and deploy

- Build log `/tmp/openclaw-pairing-resilience-build-2.log` completed with:
  - `writing image sha256:e359984e5bc9a455bd52fabe9a0ac3f7bae401e5a4e67fe21d2a01253b2a0785`
  - `naming to docker.io/library/openclaw:secure-mvp done`
  - `Container secure-openclaw-1 Recreated`
- `docker images openclaw:secure-mvp` showed:
  - `openclaw:secure-mvp e359984e5bc9 About a minute ago 3.99GB`

## Local validation rerun

- `pnpm build`
  - passed
- `pnpm test -- ui/src/ui/gateway.node.test.ts ui/src/ui/storage.node.test.ts`
  - `2` files passed
  - `20` tests passed
- `git diff --check -- <targeted files>`
  - passed with no whitespace or conflict-marker errors

## Runtime posture

- `docker inspect secure-openclaw-1` showed:
  - `ReadonlyRootfs=true`
  - `User=node`
  - `Image=sha256:e359984e5bc9a455bd52fabe9a0ac3f7bae401e5a4e67fe21d2a01253b2a0785`
  - `Health=healthy`
- `openclaw config get gateway.trustedProxies` inside the container returned:
  - `127.0.0.1`
  - `::1`
  - `172.18.0.0/16`

## Health and channel probes

- `curl -ksS -i https://openclaw-secure.tail7b2fbf.ts.net/healthz`
  - `HTTP/2 200`
  - `{"ok":true,"status":"live"}`
- `curl -ksS -i https://openclaw-secure.tail7b2fbf.ts.net/readyz`
  - `HTTP/2 200`
  - `{"ready":true}`
- `curl -ksS -I https://openclaw-secure.tail7b2fbf.ts.net/`
  - `HTTP/2 200`
- `openclaw channels status --probe --json` showed:
  - Slack probe `ok: true`, `status: 200`
  - WhatsApp `linked: true`, `running: true`, `connected: true`, `reconnectAttempts: 0`

## Control UI asset cutover gap

- Live configured root:
  - `/home/node/.openclaw/control-ui`
- Before correction, live served HTML referenced:
  - `./assets/index-rYu5KAIc.js`
- New image build output under `/app/dist/control-ui/assets` contained:
  - `index-CuS6hoIC.js`
- Mounted host asset root `/root/.openclaw/control-ui` still contained the old `index-rYu5KAIc.js` bundle.
- Corrective operator action:
  - backup created at `/root/.openclaw/control-ui.backup-20260406-051059`
  - new built assets copied from container `/app/dist/control-ui/.` into `/root/.openclaw/control-ui/`
- After correction, live served HTML references:
  - `./assets/index-CuS6hoIC.js`

## Returning-device reconnect evidence

Observed after deploy, before live asset cutover:

- Gateway log:
  - `2026-04-06T05:07:00.078+00:00 [ws] webchat connected ... client=openclaw-control-ui webchat v2026.4.2`
- No matching `device_token_mismatch`, `password missing`, or `pairing required` lines in the same log scan.

Observed during post-cutover live observation window:

- No post-cutover iPhone access from tailnet IP `100.68.93.66`
- No post-cutover `device_token_mismatch`
- No post-cutover `password missing`
- No post-cutover `pairing required`
- No post-cutover desktop or iPhone `webchat connected` event was captured during the observation window

## Host-level recovery facts

After control-plane VM restart:

- Docker daemon was not running.
- Tailscale daemon was not running.
- Ingress returned `502` until Docker, the compose stack, and Tailscale serve were recovered.

## Commands executed

```bash
ssh -o ConnectTimeout=20 exe.dev 'restart openclaw-secure.exe.xyz --json'
ssh openclaw-secure.exe.xyz 'echo ssh-ok; date -Is; uptime; whoami; hostname; docker images openclaw:secure-mvp --format "{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedSince}} {{.Size}}"; docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"; tail -n 80 /tmp/openclaw-pairing-resilience-build-2.log'
ssh openclaw-secure.exe.xyz 'nohup dockerd >/var/log/dockerd.log 2>&1 </dev/null & echo $!; sleep 3; docker version'
ssh openclaw-secure.exe.xyz 'cd /root/openclaw && HOME=/root docker compose -f deploy/secure/docker-compose.secure.yml up -d openclaw nginx'
ssh openclaw-secure.exe.xyz 'mkdir -p /run/tailscale && nohup tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock >/var/log/tailscaled.log 2>&1 </dev/null & echo $!; sleep 5; tailscale status'
ssh openclaw-secure.exe.xyz 'tailscale serve --bg --https=443 http://127.0.0.1:8080; tailscale serve status'
ssh openclaw-secure.exe.xyz 'docker inspect secure-openclaw-1 --format "ReadonlyRootfs={{.HostConfig.ReadonlyRootfs}} User={{.Config.User}} Image={{.Image}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}"'
ssh openclaw-secure.exe.xyz 'docker exec secure-openclaw-1 sh -lc "openclaw config get gateway.trustedProxies"'
ssh openclaw-secure.exe.xyz 'docker exec secure-openclaw-1 sh -lc "timeout 90 openclaw channels status --probe --json"'
ssh openclaw-secure.exe.xyz 'docker exec secure-openclaw-1 sh -lc "openclaw devices list --json"'
curl -ksS -i https://openclaw-secure.tail7b2fbf.ts.net/healthz
curl -ksS -i https://openclaw-secure.tail7b2fbf.ts.net/readyz
curl -ksS -I https://openclaw-secure.tail7b2fbf.ts.net/
curl -ksS https://openclaw-secure.tail7b2fbf.ts.net/ | rg 'assets/index-|assets/index-.*\.css' -n
ssh openclaw-secure.exe.xyz 'docker logs --since 15m secure-openclaw-1 2>&1 | egrep -i "webchat connected|device_token_mismatch|password missing|pairing required|unauthorized|repair|required" || true'
ssh openclaw-secure.exe.xyz 'docker logs --since 20m secure-nginx-1 2>&1 | egrep "100\.68\.93\.66|100\.67\.208\.85|iPhone|Mobile/|CriOS|FxiOS|Macintosh|Chrome/146" || true'
ssh openclaw-secure.exe.xyz 'set -euo pipefail; ts=$(date +%Y%m%d-%H%M%S); cp -a /root/.openclaw/control-ui /root/.openclaw/control-ui.backup-$ts; docker cp secure-openclaw-1:/app/dist/control-ui/. /root/.openclaw/control-ui/; chown -R 1000:1000 /root/.openclaw/control-ui; chmod -R a+rX /root/.openclaw/control-ui'
pnpm build
pnpm test -- ui/src/ui/gateway.node.test.ts ui/src/ui/storage.node.test.ts
git diff --check -- ui/src/ui/gateway-storage-scope.ts ui/src/ui/storage.ts ui/src/ui/device-auth.ts ui/src/ui/gateway.ts ui/src/ui/controllers/devices.ts ui/src/ui/gateway.node.test.ts vitest.config.ts deploy/secure/openclaw/cloud-lite-whatsapp-secure.fragment.json deploy/secure/openclaw/gateway.mvp.fragment.json deploy/secure/openclaw/gateway.v1_1.fragment.json deploy/secure/docs/PAIRING_RESILIENCE_B_TO_C_REPORT.md deploy/secure/docs/PAIRING_RESILIENCE_B_TO_C_EVIDENCE.md
```
