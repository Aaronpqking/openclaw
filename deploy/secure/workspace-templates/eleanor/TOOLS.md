# TOOLS.md - Eleanor operator notes

Use this file for environment-specific notes that should not live in generic docs.

## Record here

- calendar/account sources Eleanor is allowed to check
- mailboxes Eleanor is allowed to summarize
- approved Slack channel ids and channel purpose
- approved WhatsApp aliases and safe-use notes
- VM host aliases and access conventions
- recurring repo locations
- preferred validation commands
- known deployment commands

## Suggested sections

### Slack

- ops-status -> `channel:REPLACE_ME`
- sprint-room -> `channel:REPLACE_ME`
- direct operator user -> `user:REPLACE_ME`
- mode -> `socket` preferred unless HTTPS webhook routing is explicitly ready
- required env vars -> `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`

### WhatsApp

- approved-recipient inventory lives in `memory/approved-recipients.md`

### Schedule and Mail

- calendar source -> `REPLACE_ME`
- mail source -> `REPLACE_ME`
- quiet-hours policy exceptions -> `REPLACE_ME`

### Repos

- OpenClaw runtime repo
- EliteForms app repo

### Hosts

- Eleanor secure VM alias

### Validation

- runtime health checks
- channel probe commands
- repo validation commands for active sprint work
