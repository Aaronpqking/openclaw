import { describe, expect, it } from "vitest";
import {
  buildAnswerPolicyReviewPayload,
  shouldLogAnswerPolicyReviewSample,
} from "./answer-policy-review.js";

describe("buildAnswerPolicyReviewPayload", () => {
  it("returns structured fields for a mixed intent event with a limitation note", () => {
    const payload = buildAnswerPolicyReviewPayload({
      runId: "run-review",
      requestClassification: "external_current_state_required",
      classificationReason: "current officeholder inquiry",
      freshnessRequired: true,
      verificationStatus: "source_unavailable",
      limitationNoteApplied: true,
      responseOverridden: false,
      hasMixedIntentSignal: true,
    });

    expect(payload.event_name).toBe("answer_policy_review");
    expect(payload.handler).toBe("pi-embedded-subscribe.handlers.messages");
    expect(payload.request_classification).toBe("external_current_state_required");
    expect(payload.verification_attempted).toBe(true);
    expect(payload.verification_available).toBe(false);
    expect(payload.limitation_note_applied).toBe(true);
    expect(payload.has_mixed_intent_signal).toBe(true);
    expect(payload.response_overridden).toBe(false);
    expect(payload.intent_shape).toBe("external_current_state_required");
  });

  it("records single-intent cases without mixed instructions", () => {
    const payload = buildAnswerPolicyReviewPayload({
      runId: "run-review-2",
      requestClassification: "provided_context_only",
      classificationReason: "transcript summary request",
      freshnessRequired: false,
      verificationStatus: "unverified",
      limitationNoteApplied: false,
      responseOverridden: false,
      hasMixedIntentSignal: false,
    });

    expect(payload.verification_attempted).toBe(false);
    expect(payload.limitation_note_applied).toBe(false);
    expect(payload.has_mixed_intent_signal).toBe(false);
  });

  it("always samples mixed or limitation-note runs for review logs", () => {
    const mixedPayload = buildAnswerPolicyReviewPayload({
      runId: "run-review-3",
      requestClassification: "external_current_state_required",
      classificationReason: "time-sensitive status/state inquiry",
      freshnessRequired: true,
      verificationStatus: "source_unavailable",
      limitationNoteApplied: true,
      responseOverridden: false,
      hasMixedIntentSignal: true,
    });
    expect(shouldLogAnswerPolicyReviewSample(mixedPayload)).toBe(true);
  });
});
