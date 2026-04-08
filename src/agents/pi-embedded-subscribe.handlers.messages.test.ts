import { describe, expect, it } from "vitest";
import {
  applyVerifiedAnswerPolicy,
  buildAssistantStreamData,
  hasAssistantVisibleReply,
  resolveSilentReplyFallbackText,
} from "./pi-embedded-subscribe.handlers.messages.js";

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
    expect(result.reason).toBe("freshness_unverified");
    expect(result.text).toContain("couldn't verify");
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
});
