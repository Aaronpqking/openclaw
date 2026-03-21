# Operator Debug Commands

These commands are the operator-readable audit surface for the secure runtime.

## Tools

```bash
openclaw gateway call tools.catalog --json
openclaw config get tools --json
openclaw agent --agent main --message "List your tool names only." --thinking minimal --timeout 90 --json
```

## Plugins

```bash
openclaw plugins list
openclaw plugins list --json
```

Interpretation:

- `loaded`: active in this runtime
- `disabled`: present but not enabled
- missing row: unavailable

## Skills

```bash
openclaw skills list
openclaw skills list --json
```

Interpretation:

- `ready`: eligible now
- `blocked`: present but policy-blocked
- `missing`: dependency/auth/environment problem

## Channels

```bash
openclaw channels status --probe
openclaw channels login --channel whatsapp
```

## Devices and pairing

```bash
openclaw devices list
openclaw devices approve --latest
openclaw devices remove <deviceId>
openclaw devices revoke --device <deviceId> --role operator
```

## Exec approvals

```bash
openclaw approvals get --gateway
openclaw approvals allowlist add --gateway "/path/to/bin"
openclaw approvals allowlist remove --gateway "/path/to/bin"
```

## Sessions

```bash
openclaw status --all
openclaw status --deep
```

## Model/runtime sanity

```bash
openclaw models status --json
openclaw config validate
```

## Current secure runtime check

Use this short sequence first:

```bash
openclaw config validate
openclaw gateway call tools.catalog --json
openclaw plugins list
openclaw skills list
openclaw channels status --probe
openclaw approvals get --gateway
```
