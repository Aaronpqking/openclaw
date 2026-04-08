# Eleanor Model Skills Matrix

## Purpose

Recommend models by skill and task type for Eleanor.

These are operating recommendations, not hardcoded routing rules.

## Current guidance

Use OpenAI 5.4-family models as the default operational baseline.

Reasons:

- they are supported directly in this repo
- `gpt-5.4-mini` and `gpt-5.4-nano` fit lightweight assistant work
- `gpt-5.4` remains the stronger high-confidence model for planning and difficult execution

Do not make Groq or DeepSeek the default recovery path until quota and billing are stable in production.

Grok is supported directly in this repo through the bundled `xai` provider.
DeepSeek is available through multiple provider surfaces in this repo, but the live direct DeepSeek path has already shown billing instability.

## Recommended defaults

### Heartbeat and triage

- primary: `openai/gpt-5.4-nano`
- secondary: `openai/gpt-5.4-mini`

Use for:

- schedule scan
- mail scan
- Slack triage
- short summaries
- low-cost recurring checks

### General assistant work

- primary: `openai/gpt-5.4-mini`

Use for:

- reminders
- concise operator updates
- routine planning
- drafting short Slack and WhatsApp messages
- deciding whether approval is needed

### High-stakes planning and execution

- primary: `openai/gpt-5.4`

Use for:

- deployment diagnosis
- nontrivial repo surgery
- conflict resolution between docs and runtime truth
- complex sprint planning
- high-risk operator recommendations

### Long-context document digestion

- primary: `google/gemini-3.1-pro-preview`

Use for:

- reading long specs
- large doc comparisons
- synthesis across many source files

Caution:

- do not rely on it as sole production default until quota is stable

### Optional coding specialists

- optional: Groq-hosted OSS coding models when quotas are healthy
- optional: DeepSeek coding-oriented models when billing is healthy

Use only for:

- bounded code-generation or exploration work
- non-default specialist runs

Do not use as default routing today because the live deployment already showed:

- Groq TPM exhaustion risk
- DeepSeek insufficient balance risk

## Suggested skill-to-model mapping

### Schedule and mail assistant

- `openai/gpt-5.4-nano` for raw triage
- `openai/gpt-5.4-mini` when summary quality matters

### Scrum master

- `openai/gpt-5.4-mini` by default
- `openai/gpt-5.4` for difficult blocker analysis

### Repo investigator

- `openai/gpt-5.4`
- `google/gemini-3.1-pro-preview` for long-context reading

### Deployment operator

- `openai/gpt-5.4`

### Personal communications draft helper

- `openai/gpt-5.4-mini`

### Low-cost standing checks

- `openai/gpt-5.4-nano`

## Rating matrix

Rating scale:

- `5` strong fit
- `4` good fit
- `3` usable with caveats
- `2` weak fit
- `1` avoid for this role

| Activity                      | `openai/gpt-5.4-nano` | `openai/gpt-5.4-mini` | `openai/gpt-5.4` | `xai/grok-4-fast-reasoning` | `xai/grok-code-fast-1` | `groq/<coding-model>` | `deepseek/<coding-model>` | `google/gemini-3.1-pro-preview` |
| ----------------------------- | --------------------- | --------------------- | ---------------- | --------------------------- | ---------------------- | --------------------- | ------------------------- | ------------------------------- |
| heartbeat triage              | 5                     | 4                     | 3                | 3                           | 2                      | 2                     | 2                         | 3                               |
| schedule and mail summary     | 4                     | 5                     | 4                | 3                           | 2                      | 2                     | 2                         | 4                               |
| scrum-master reporting        | 3                     | 5                     | 5                | 4                           | 2                      | 2                     | 2                         | 4                               |
| repo investigation            | 2                     | 4                     | 5                | 4                           | 4                      | 3                     | 3                         | 5                               |
| coding implementation         | 1                     | 3                     | 5                | 4                           | 5                      | 4                     | 4                         | 3                               |
| large-spec digestion          | 2                     | 3                     | 4                | 3                           | 2                      | 2                     | 3                         | 5                               |
| concise operator messaging    | 4                     | 5                     | 4                | 3                           | 2                      | 2                     | 2                         | 3                               |
| low-cost recurring automation | 5                     | 4                     | 2                | 2                           | 1                      | 1                     | 1                         | 2                               |

## Practical recommendations by role

### Eleanor default assistant chain

1. `openai/gpt-5.4-mini`
2. `openai/gpt-5.4`
3. `google/gemini-3.1-pro-preview`

### Eleanor heartbeat lane

1. `openai/gpt-5.4-nano`
2. `openai/gpt-5.4-mini`

### EliteForms review lane

1. `openai/gpt-5.4`
2. `google/gemini-3.1-pro-preview`
3. `xai/grok-4-fast-reasoning`

### Coding-specialist lane

1. `xai/grok-code-fast-1`
2. `openai/gpt-5.4`
3. optional `groq/<coding-model>` when quota is healthy
4. optional `deepseek/<coding-model>` when billing is healthy

## Current production caution

- live OpenAI path has succeeded on valid requests
- live Groq path has shown TPM over-limit behavior
- live Google path has shown quota exhaustion
- live DeepSeek path has shown insufficient balance

Treat this matrix as routing guidance, not proof that every provider is currently healthy.

## Deployment recommendation

If you want one immediate practical default chain for Eleanor:

1. default routine model: `openai/gpt-5.4-mini`
2. lightweight heartbeat option: `openai/gpt-5.4-nano`
3. escalated/high-confidence model: `openai/gpt-5.4`
4. optional long-context fallback: `google/gemini-3.1-pro-preview`
