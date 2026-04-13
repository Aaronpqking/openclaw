# Live Verification Review

When investigating whether Option 3 (a compound-intent splitter) is justified, start with the `answer_policy_review` audit stream emitted by `pi-embedded-subscribe.handlers.messages`. This structured, low-noise event includes:

- `event_name`: always `answer_policy_review`.
- `request_classification` and `classification_reason`: intent signals from the deterministic request classifier.
- `has_mixed_intent_signal`: whether the prompt combined provided-context work with an external, live-state ask.
- `freshness_required`: the gating flag that triggers a limitation note.
- `verification_attempted`: mirrors `freshness_required`.
- `verification_available`: whether a live source was confirmed.
- `limitation_note_applied`: whether the user saw the “couldn't verify” suffix.
- `response_overridden`: whether completion-claim overrides replaced the answer (legacy guardrail).
- `intent_shape`: same as `request_classification` for quick filtering.

The stream is emitted once per policy decision; it never logs raw prompts or sensitive content. The `agents/answer-policy` subsystem also writes sampled `answer_policy_review` log lines (always for mixed-intent or limitation-note cases, plus a deterministic low-rate baseline sample) so operators can grep quickly without lifecycle-log noise.

### Review heuristics

Monitor the `answer_policy_review` stream over a 7–14 day rolling window. Consider Option 3 only if all of the following are true for the sampled limitation-note runs:

1. **Mixed-prompt misclassification rate** exceeds 2% of limitation-note events (`has_mixed_intent_signal=true` while `limitation_note_applied=true`).
2. **Event frequency** shows at least 10 mixed-prompt misclassifications per week, or at least 3 clearly user-visible incidents per week (e.g., Slack/WhatsApp complaints requesting missing live data).
3. **Single-intent false positives** remain rare (`has_mixed_intent_signal=false` while `limitation_note_applied=true`)—target <0.5%.
4. **Compound patterns repeat** (same `classification_reason`, same handler path, and similar policy outputs across multiple runs).

Option 3 should only be promoted once these criteria are satisfied consistently for at least one rolling window. Until then, use the review stream to triage unexpected limitation notes and tune the classifier heuristics instead of splitting prompts.

See `answer_policy_review` logs (via `emitAgentEvent` or your telemetry dashboard) for evidence. Keep documentation references up to date in `docs/operations` when new instrumentation is added.
