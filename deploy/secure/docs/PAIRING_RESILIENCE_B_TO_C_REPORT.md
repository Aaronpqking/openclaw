# Pairing Resilience B to C Report

Date: 2026-04-06
Status: PARTIAL

## Phase B summary

Phase B recovered the secure VM, completed the `openclaw:secure-mvp` rebuild, deployed the fresh image, restored ingress, and revalidated channel health and secure runtime posture.

A second live-cutover gap was then found: `gateway.controlUi.root` is configured to `/home/node/.openclaw/control-ui`, and that mounted asset directory was still serving the old Control UI bundle even after the new container image was deployed. The mounted asset root was backed up and updated from `/app/dist/control-ui`, and the live HTML now references the new bundle.

Phase B is still not accepted. Returning-device reconnect proof is incomplete for the live patched browser bundle:

- desktop returning-device reconnect on the patched served bundle: unverified
- iPhone returning-device reconnect on the patched served bundle: unverified

No Phase C work started.

## Verified live runtime state

- VM reachable again over SSH after control-plane restart.
- Docker daemon and Tailscale daemon were not running after the VM restart; both were recovered manually.
- Fresh image built and deployed live: `openclaw:secure-mvp sha256:e359984e5bc9a455bd52fabe9a0ac3f7bae401e5a4e67fe21d2a01253b2a0785`.
- Runtime version in container remains `2026.4.2`.
- `secure-openclaw-1` is healthy.
- `ReadonlyRootfs=true` and `User=node` are preserved.
- Live `gateway.trustedProxies` includes `127.0.0.1`, `::1`, and `172.18.0.0/16`.
- `/healthz` returns `200 {"ok":true,"status":"live"}`.
- `/readyz` returns `200 {"ready":true}`.
- `/` serves Control UI HTML.
- Slack probe is healthy.
- WhatsApp is linked, running, connected, and has `reconnectAttempts: 0`.
- Pending pairing queue is empty.
- Local validation rerun in this turn passed:
  - `pnpm build`
  - `pnpm test -- ui/src/ui/gateway.node.test.ts ui/src/ui/storage.node.test.ts`
  - `git diff --check -- <targeted files>`

## Verified blockers

- The live Control UI initially served an old browser bundle from `/root/.openclaw/control-ui` even though the new image had been deployed.
- That mismatch is now corrected, but no real returning-device reconnect from the paired desktop or the paired iPhone was observed after the live asset cutover.
- No post-cutover iPhone request from `100.68.93.66` appeared during the observation window.

## Phase C status

Not started. Phase B is a hard gate and is still incomplete.
