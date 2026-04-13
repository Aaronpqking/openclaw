import { describe, expect, it, vi } from "vitest";
import { emitAgentEvent } from "../infra/agent-events.js";
import {
  applyVerifiedAnswerPolicy,
  buildAssistantStreamData,
  emitAnswerPolicyReviewEvent,
  hasAssistantVisibleReply,
  resolveSilentReplyFallbackText,
} from "./pi-embedded-subscribe.handlers.messages.js";
import {
  finalizeRetrievalTraceForRun,
  initializeRetrievalTraceForRun,
  peekRetrievalTraceForRun,
} from "./retrieval-trace.js";

vi.mock("../infra/agent-events.js", () => ({
  emitAgentEvent: vi.fn(),
}));

describe("resolveSilentReplyFallbackText", () => {
  it("replaces NO_REPLY with latest messaging tool text when available", () => {
    expect(
      resolveSilentReplyFallbackText({
        text: "NO_REPLY",
        messagingToolSentTexts: ["first", "final delivered text"],
      }),
    ).toBe("final delivered text");
  });

  it("keeps original text when response is not NO_REPLY", () => {
    expect(
      resolveSilentReplyFallbackText({
        text: "normal assistant reply",
        messagingToolSentTexts: ["final delivered text"],
      }),
    ).toBe("normal assistant reply");
  });

  it("keeps NO_REPLY when there is no messaging tool text to mirror", () => {
    expect(
      resolveSilentReplyFallbackText({
        text: "NO_REPLY",
        messagingToolSentTexts: [],
      }),
    ).toBe("NO_REPLY");
  });
});

describe("hasAssistantVisibleReply", () => {
  it("treats audio-only payloads as visible", () => {
    expect(hasAssistantVisibleReply({ audioAsVoice: true })).toBe(true);
  });

  it("detects text or media visibility", () => {
    expect(hasAssistantVisibleReply({ text: "hello" })).toBe(true);
    expect(hasAssistantVisibleReply({ mediaUrls: ["https://example.com/a.png"] })).toBe(true);
    expect(hasAssistantVisibleReply({})).toBe(false);
  });
});

describe("buildAssistantStreamData", () => {
  it("normalizes media payloads for assistant stream events", () => {
    expect(
      buildAssistantStreamData({
        text: "hello",
        delta: "he",
        mediaUrl: "https://example.com/a.png",
      }),
    ).toEqual({
      text: "hello",
      delta: "he",
      mediaUrls: ["https://example.com/a.png"],
    });
  });
});

describe("emitAnswerPolicyReviewEvent", () => {
  it("emits structured review data through lifecycle event hooks", () => {
    vi.mocked(emitAgentEvent).mockClear();
    const onAgentEvent = vi.fn();
    const payload = emitAnswerPolicyReviewEvent({
      runId: "run-review-event",
      requestClassification: "external_current_state_required",
      classificationReason: "current officeholder inquiry",
      freshnessRequired: true,
      verificationStatus: "source_unavailable",
      limitationNoteApplied: true,
      responseOverridden: false,
      hasMixedIntentSignal: true,
      onAgentEvent,
    });
    expect(vi.mocked(emitAgentEvent)).toHaveBeenCalledWith({
      runId: "run-review-event",
      stream: "answer_policy_review",
      data: payload,
    });
    expect(onAgentEvent).toHaveBeenCalledWith({
      stream: "answer_policy_review",
      data: payload,
    });
    expect(payload).toMatchObject({
      event_name: "answer_policy_review",
      request_classification: "external_current_state_required",
      classification_reason: "current officeholder inquiry",
      freshness_required: true,
      verification_attempted: true,
      verification_available: false,
      limitation_note_applied: true,
      has_mixed_intent_signal: true,
    });
  });
});

describe("applyVerifiedAnswerPolicy", () => {
  it("blocks freshness-required replies when live verification is unavailable", () => {
    const result = applyVerifiedAnswerPolicy({
      text: "The system is healthy now.",
      retrievalTrace: {
        checked_layers: ["active_conversation", "live_connected_data_sources"],
        selected_layer: "active_conversation",
        escalated_to_live_source: false,
        selected_source: null,
        contributing_sources: [],
        multi_source_synthesis: false,
        derived_synthesis: false,
        freshness_required: true,
        verification_status: "source_unavailable",
        confidence: 0.4,
        stale_risk: "high",
        missing_expected_source: true,
        requested_model: "groq/qwen/qwen3-32b",
        resolved_model: "groq/qwen/qwen3-32b",
        retrieval_policy_version: "2026-04-05.det-v1",
        request_classification: "external_current_state_required",
        classification_reason: "source-specific live data request",
        has_mixed_intent_signal: false,
      },
      routeAuditSummary: {
        saw_allowlist_deny: false,
        shell_probe_attempted: false,
        browser_attempted: false,
        browser_failed: false,
        gog_attempted: false,
        task_completed_verified: false,
      },
    });

    expect(result.policy_enforced).toBe(false);
    expect(result.reason).toBe("freshness_unverified");
    expect(result.text).toBe("The system is healthy now.");
    expect(result.limitation_note).toContain("couldn't verify");
    expect(result.limitation_note).toContain(
      "Live source verification was unavailable in this run.",
    );
  });

  it("blocks completion claims without task_completed_verified", () => {
    const result = applyVerifiedAnswerPolicy({
      text: "I fixed it and completed the deploy.",
      retrievalTrace: {
        checked_layers: ["active_conversation"],
        selected_layer: "active_conversation",
        escalated_to_live_source: false,
        selected_source: null,
        contributing_sources: [],
        multi_source_synthesis: false,
        derived_synthesis: false,
        freshness_required: false,
        verification_status: "unverified",
        confidence: 0.8,
        stale_risk: "low",
        missing_expected_source: false,
        requested_model: "openai/gpt-5.4",
        resolved_model: "openai/gpt-5.4",
        retrieval_policy_version: "2026-04-05.det-v1",
        request_classification: "stable_general_knowledge",
        classification_reason: "general knowledge fallback",
        has_mixed_intent_signal: false,
      },
      routeAuditSummary: {
        saw_allowlist_deny: false,
        shell_probe_attempted: false,
        browser_attempted: false,
        browser_failed: false,
        gog_attempted: false,
        task_completed_verified: false,
      },
    });

    expect(result.policy_enforced).toBe(true);
    expect(result.reason).toBe("completion_unverified");
    expect(result.text).toContain("can't claim completion");
  });

  it("does not add a disclaimer when freshness is not required", () => {
    const result = applyVerifiedAnswerPolicy({
      text: "Here is a summary of the conversation.",
      retrievalTrace: {
        checked_layers: ["active_conversation"],
        selected_layer: "active_conversation",
        escalated_to_live_source: false,
        selected_source: null,
        contributing_sources: [],
        multi_source_synthesis: false,
        derived_synthesis: false,
        freshness_required: false,
        verification_status: "source_unavailable",
        confidence: 0.4,
        stale_risk: "high",
        missing_expected_source: false,
        requested_model: "openai/gpt-5.4-mini",
        resolved_model: "openai/gpt-5.4-mini",
        retrieval_policy_version: "2026-04-05.det-v1",
        request_classification: "provided_context_only",
        classification_reason: "content summarization request",
        has_mixed_intent_signal: false,
      },
      routeAuditSummary: {
        saw_allowlist_deny: false,
        shell_probe_attempted: false,
        browser_attempted: false,
        browser_failed: false,
        gog_attempted: false,
        task_completed_verified: false,
      },
    });

    expect(result.limitation_note).toBeUndefined();
    expect(result.text).toBe("Here is a summary of the conversation.");
  });

  it("aligns classification, retrieval trace, and policy for mixed prompts", () => {
    const runId = "run-mixed-pipeline";
    const prompt = "Summarize this email and tell me whether the sender is still the CEO today.";
    initializeRetrievalTraceForRun(runId, {
      prompt,
      requestedModel: "openai/gpt-5.4",
      resolvedModel: "openai/gpt-5.4",
    });
    const trace = peekRetrievalTraceForRun(runId);
    expect(trace).not.toBeNull();
    const retrievalTrace = trace!;
    expect(retrievalTrace.request_classification).toBe("external_current_state_required");
    expect(retrievalTrace.classification_reason).toBe("current officeholder inquiry");
    expect(retrievalTrace.freshness_required).toBe(true);

    const result = applyVerifiedAnswerPolicy({
      text: "Here is the summary of the email.",
      retrievalTrace,
      routeAuditSummary: {
        saw_allowlist_deny: false,
        shell_probe_attempted: false,
        browser_attempted: false,
        browser_failed: false,
        gog_attempted: false,
        task_completed_verified: false,
      },
    });

    expect(result.reason).toBe("freshness_unverified");
    expect(result.text).toBe("Here is the summary of the email.");
    expect(result.limitation_note).toContain("couldn't verify");
    finalizeRetrievalTraceForRun(runId);
  });
});
