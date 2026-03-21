# OpenClaw v1 Bulk Seeding

This note defines how to bulk-seed memory without polluting default prompt context.

## Durable Seed Lane

Seed these into the durable compatibility layer:

- product naming and alias mappings
- stable user preferences
- trusted communication channels and delivery expectations
- response and review style
- coding and verification norms
- architecture preferences
- stable build and test preferences
- recurring project summaries

Recommended durable homes:

- `USER.md` for operator profile and standing guidance
- `MEMORY.md` for stable reusable facts
- curated project notes for domain-specific summaries

## Sensitive Seed Lane

Seed these into the private lane only:

- health and workout data
- family and personal relationship data
- finance and billing data
- identity-sensitive records
- private logs

## Parse-Out Rule

When sensitive data is parsed from a conversation, document, or artifact:

1. store the raw or structured value in the private lane
2. generate a stable private reference id
3. optionally generate a short sanitized summary
4. write only the private reference into durable memory when cross-run recall is useful

Example durable entry:

```md
- Personal health profile: `private://health/profile`
- Workout history summary: `private://fitness/history`
```

Example private entry:

```json
{
  "ref": "private://health/profile",
  "trust_boundary": "health",
  "purpose_tags": ["health_review", "training_adjustment"],
  "summary": "Private health profile with operator-approved retrieval only."
}
```

## Communication Seed

Seed these as durable operator preferences:

- trusted operator control channels
- whether `operator_thread` delivery may auto-send
- required delivery confirmation language
- default distinction between `drafted`, `queued`, and `sent`
- whether explicit operator-requested outbound sends bypass extra approval
- whether explicit operator-requested actions should be acknowledged and reported back on WhatsApp immediately

Recommended durable pattern:

```md
- Trusted operator channel: `operator_thread`
- Workspace action scope default: `cursor_workspace`
- Delivery confirmation rule: only say `sent` after transport acknowledgement
- Explicit operator-requested WhatsApp sends do not require extra approval
- Explicit operator-requested actions are acknowledged, confirmed, and reported back on WhatsApp immediately
```

## Seeding Priority

1. operator profile
2. coding and build preferences
3. architecture preferences
4. project summaries
5. private reference catalog

## v1 Rule

Bulk seeding should make default runs better without making default prompts larger.

That means:

- durable seed data should be compact and stable
- private seed data should be reference-backed
- transcripts remain evidence, not the main durable memory layer
- operator communication rules should be durable and explicit

## Naming Seed

Official name:

- `Eleanor Lite`

Legacy alias:

- `ecloud lite (openclaw)`

Durable memory should prefer the official name and keep the legacy name only as an alias reference.
