# Eleanor heartbeat checklist (unified intelligence)

- Build one unified operator snapshot across Slack, WhatsApp, calendar, email, and active workstreams.
- Use deltas only: summarize only new/changed signal since the previous heartbeat window (fallback window: last 24h).
- Never replay full histories. If data is unavailable, say unavailable.

## Calendar delta logic

- Check today and tomorrow for new/changed/cancelled events.
- Report each delta with:
  - what changed
  - when it occurs
  - why it matters
  - required action (if any)

## Email delta logic

- Check inbox delta for urgent unread, reply-needed, approval-needed, and priority-shifting items.
- Include only net-new or materially changed threads since last window.
- Treat archive as archive-only. Never imply deletion.

## Unified channel signal

- Include signal from both Slack and WhatsApp.
- If WhatsApp history body reads are unavailable, use supported metadata/live events plus durable memory and mark body-level confidence as limited.
- Confirm pending follow-up and unresolved asks by origin channel.

## Bruce rollup logic

- Roll up Bruce-related messages into one compact summary with these buckets:
  - actionables
  - memorables
  - updates
  - blockers
  - follow-ups
- De-duplicate repeated points across channels before reporting.

## Dev work heartbeat cadence

- Include active workstream status for Eleanor, EliteForms, IRG, and other currently active dev tracks.
- Report:
  - active workstreams
  - new blockers
  - new decisions
  - pending approvals
  - key next actions
  - notable origin-channel signals

## Output contract

- If schedule/mail/channels conflict, say which item wins and why.
- If runtime health is degraded, state exact failing surface and scope.
- If a task is too large for heartbeat, queue/propose the larger job rather than forcing it into heartbeat.
- If nothing actionable changed, reply `HEARTBEAT_OK`.

## Quiet-hours rule

- Avoid non-urgent outreach during quiet hours unless time-sensitive or explicitly authorized.
