import { describe, expect, it } from "vitest";
import { mapThinkingLevelForModel } from "./utils.js";

describe("mapThinkingLevelForModel", () => {
  it("maps minimal to low for OpenAI GPT-5 responses", () => {
    expect(
      mapThinkingLevelForModel({
        level: "minimal",
        provider: "openai",
        modelId: "gpt-5.4-mini",
        api: "openai-responses",
      }),
    ).toBe("low");
  });

  it("preserves minimal for non-OpenAI providers", () => {
    expect(
      mapThinkingLevelForModel({
        level: "minimal",
        provider: "anthropic",
        modelId: "claude-sonnet-4.5",
        api: "anthropic",
      }),
    ).toBe("minimal");
  });
});
