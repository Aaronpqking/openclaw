import { describe, expect, it } from "vitest";
import { classifyRequest } from "./request-classifier.js";

describe("request classifier", () => {
  it("marks a transcript summary as provided context", () => {
    const result = classifyRequest({
      prompt: "Summarize the transcript below and highlight the decisions.",
    });
    expect(result.classification).toBe("provided_context_only");
  });

  it("marks an email rewrite request as provided context", () => {
    const result = classifyRequest({
      prompt: "Rewrite this email to sound more professional.",
    });
    expect(result.classification).toBe("provided_context_only");
  });

  it("marks code analysis prompts as provided context", () => {
    const result = classifyRequest({
      prompt: "Analyze this code snippet and explain why it fails.",
    });
    expect(result.classification).toBe("provided_context_only");
  });

  it("marks general email summarization as provided context even when quoted text mentions real-time words", () => {
    const result = classifyRequest({
      prompt:
        'Summarize this transcript: "Today we reviewed the launch plan, and the current status is still pending."',
    });
    expect(result.classification).toBe("provided_context_only");
  });

  it("marks repo structure requests as tool usage", () => {
    const result = classifyRequest({
      prompt: "Assess the repo structure from the local files available.",
    });
    expect(result.classification).toBe("tool_required_non_current");
  });

  it("marks explicit current officeholder questions as requiring live data", () => {
    const result = classifyRequest({
      prompt: "Who is the current president of the United States?",
    });
    expect(result.classification).toBe("external_current_state_required");
  });

  it("marks latest fact requests as requiring live data", () => {
    const result = classifyRequest({
      prompt: "What is the latest fact about the stock market right now?",
    });
    expect(result.classification).toBe("external_current_state_required");
  });

  it("marks sender employment status questions as external current-state requests", () => {
    const result = classifyRequest({
      prompt: "Does this sender still work there right now?",
    });
    expect(result.classification).toBe("external_current_state_required");
  });

  it("flags mixed prompts that combine summaries with live-state asks", () => {
    const result = classifyRequest({
      prompt: "Summarize this email and tell me if the sender is still the CEO today.",
    });
    expect(result.classification).toBe("external_current_state_required");
    expect(result.hasMixedIntentSignal).toBe(true);
  });

  it("does not flag single-intent summaries as mixed", () => {
    const result = classifyRequest({
      prompt: "Summarize this email in a professional tone.",
    });
    expect(result.classification).toBe("provided_context_only");
    expect(result.hasMixedIntentSignal).toBe(false);
  });
});
