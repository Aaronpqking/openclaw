# WhatsApp Channel Status

## Current audited state

Repo/runtime status commands show:

- plugin: loaded
- channel config: enabled
- login state: not linked
- listener state: stopped/disconnected because there is no linked WhatsApp Web session

That means WhatsApp support is present in the current build, but the channel is not ready yet.

## Readiness criteria

Do not claim WhatsApp works until all four are true:

1. channel configured
2. login active
3. listener active
4. send path passes a smoke test

## Proof commands

### Plugin installed and loaded

```bash
openclaw plugins list | rg whatsapp
```

Expected:

- `loaded` means the plugin is present and active
- `disabled` means bundled but not active
- no row means unavailable in the current runtime

### Channel status

```bash
openclaw channels status --probe
```

Interpretation:

- `not linked` means QR login still needs to happen
- `stopped` / `disconnected` means the listener is not active
- `running` / `connected` means the socket is up

### Link WhatsApp

```bash
openclaw channels login --channel whatsapp
```

This requires a real QR scan by the WhatsApp account you want the gateway to own.

### Smoke test

After link succeeds and status shows connected:

```bash
openclaw channels status --probe
openclaw agent --to +15551234567 --message "Reply with OK only" --thinking minimal --timeout 90 --json
```

Use a real allowlisted destination instead of the placeholder.

## Current blocker

The current runtime blocker is not plugin absence. It is missing WhatsApp Web login state.

## Best current workaround

Use the Control UI or CLI QR login flow on the gateway host, then re-run:

```bash
openclaw channels status --probe
```

Only after the status shows linked/running/connected should outbound smoke testing be trusted.
