import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ReasoningLevel, ThinkLevel } from "../../auto-reply/thinking.js";

export function mapThinkingLevel(level?: ThinkLevel): ThinkingLevel {
  // pi-agent-core supports "xhigh"; OpenClaw enables it for specific models.
  if (!level) {
    return "off";
  }
  // "adaptive" maps to "medium" at the pi-agent-core layer.  The Pi SDK
  // provider then translates this to `thinking.type: "adaptive"` with
  // `output_config.effort: "medium"` for models that support it (Opus 4.6,
  // Sonnet 4.6).
  if (level === "adaptive") {
    return "medium";
  }
  return level;
}

export function mapThinkingLevelForModel(params: {
  level?: ThinkLevel;
  provider?: string;
  modelId?: string;
  api?: string;
}): ThinkingLevel {
  const mapped = mapThinkingLevel(params.level);
  if (mapped !== "minimal") {
    return mapped;
  }
  const provider = params.provider?.trim().toLowerCase();
  const modelId = params.modelId?.trim().toLowerCase();
  const api = params.api?.trim().toLowerCase();
  // OpenAI Responses rejects "minimal" on GPT-5.4 mini and related variants.
  if (
    (provider === "openai" || provider === "openai-codex") &&
    api?.includes("openai") &&
    modelId?.startsWith("gpt-5")
  ) {
    return "low";
  }
  return mapped;
}

export function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    const serialized = JSON.stringify(error);
    return serialized ?? "Unknown error";
  } catch {
    return "Unknown error";
  }
}

export type { ReasoningLevel, ThinkLevel };
