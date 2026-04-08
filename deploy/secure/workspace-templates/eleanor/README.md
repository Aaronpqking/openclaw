# Eleanor Workspace Templates

These files are the canonical Eleanor workspace bootstrap set for the secure deployment.

Install them into the live workspace after reviewing placeholders:

- `AGENTS.md`
- `HEARTBEAT.md`
- `MEMORY.md`
- `USER.md`
- `SOUL.md`
- `TOOLS.md`

Target location on the Eleanor VM:

- `~/.openclaw/workspace/`

Rules:

- do not commit real tokens, passwords, channel ids, or phone numbers into these files
- keep approved contact lists and channel ids in operator-controlled memory files or live config after review
- review these templates before each major sprint if Eleanor's role changes

Suggested follow-up after install:

1. update placeholders
2. configure Slack in runtime
3. verify WhatsApp approved-contact policy
4. add current sprint state to memory files
