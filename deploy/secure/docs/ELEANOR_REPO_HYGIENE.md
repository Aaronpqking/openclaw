# Eleanor Repo Hygiene

## Current recommendation

Do not fork OpenClaw immediately just to store Eleanor workspace files and sprint instructions.

That would mix two different concerns:

- OpenClaw product/runtime changes
- Eleanor operator policy and sprint management

## Recommended structure

### Keep in this repo for now

Keep only the minimum Eleanor package in this repo:

- `deploy/secure/docs/*`
- `deploy/secure/workspace-templates/eleanor/*`
- narrow runtime patches that are truly OpenClaw behavior changes

### Move to a separate private repo when one of these becomes true

- Eleanor accumulates substantial project-management docs unrelated to OpenClaw runtime
- workspace files become highly personalized and operationally sensitive
- you want issue tracking, sprint history, and private notes without OpenClaw product churn
- you need to manage multiple repos from one operator package

Recommended future repo name:

- `eleanor-ops`
- or `eleanor-control`

That repo should hold:

- canonical live workspace files
- sprint boards
- sign-off trackers
- approved recipient inventories
- host and environment runbooks

OpenClaw should remain the runtime/product repo.

## Immediate cleanup goals

The current OpenClaw checkout should be made clean enough for safe sprint work:

- remove or isolate recovery-only debris
- stop mixing deploy evidence with product changes
- keep local secrets and artifacts ignored
- separate emergency runtime fixes from operator-policy docs

## Near-term practical recommendation

For the next 24 hours:

1. keep the Eleanor package here under `deploy/secure/`
2. install the workspace templates on the VM
3. connect Slack
4. start the sprint

After the sprint begins:

1. split the emergency runtime patch from unrelated dirty changes
2. decide whether to open a private `eleanor-ops` repo
3. move the canonical live workspace there if the operator layer keeps growing
