import { describe, expect, it } from "vitest";
import { resolveFallbackTransition } from "../fallback-state.js";
import { buildModelSelectionEventData } from "./agent-runner.js";

describe("buildModelSelectionEventData", () => {
  it("captures requested, resolved, final, and fallback reason details", () => {
    const attempts = [
      {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        error: "429 rate limited",
        reason: "rate_limit",
        status: 429,
        code: "rate_limit",
      },
    ];
    const fallbackTransition = resolveFallbackTransition({
      selectedProvider: "anthropic",
      selectedModel: "claude-sonnet-4-6",
      activeProvider: "openai",
      activeModel: "gpt-5.4-mini",
      attempts,
      state: undefined,
    });

    expect(
      buildModelSelectionEventData({
        requestedProvider: "anthropic",
        requestedModel: "claude-sonnet-4-6",
        resolvedProvider: "openai",
        resolvedModel: "gpt-5.4-mini",
        fallbackTransition,
        attempts,
      }),
    ).toMatchObject({
      phase: "model_selection",
      requestedProvider: "anthropic",
      requestedModel: "claude-sonnet-4-6",
      resolvedProvider: "openai",
      resolvedModel: "gpt-5.4-mini",
      requested_model: "anthropic/claude-sonnet-4-6",
      resolved_model: "openai/gpt-5.4-mini",
      model_source: "fallback",
      fallback_chain: ["anthropic/claude-sonnet-4-6"],
      fallback_reason: expect.any(String),
      model_access_reason: "requested_unavailable_fallback_applied",
      surface_policy_reason: "none",
      task_class: "operational_routing_tool_use_triage",
      provider_health_status: "degraded",
      finalProvider: "openai",
      finalModel: "gpt-5.4-mini",
      fallbackApplied: true,
      reasonCodes: ["rate_limit"],
      attempts: [
        expect.objectContaining({
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          reason: "rate_limit",
          code: "rate_limit",
          status: 429,
        }),
      ],
    });
  });
});
