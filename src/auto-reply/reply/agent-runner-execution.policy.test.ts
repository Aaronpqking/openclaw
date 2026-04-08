import { describe, expect, it } from "vitest";
import { resolveModelTaskClassPolicy } from "./agent-runner-execution.js";

describe("resolveModelTaskClassPolicy", () => {
  it("allows groq for Google Workspace operational tasks", () => {
    const policy = resolveModelTaskClassPolicy({
      provider: "groq",
      commandBody: "check gmail inbox and summarize unread messages",
    });
    expect(policy).toMatchObject({
      blocked: false,
      taskClass: "operational_routing_tool_use_triage",
    });
  });

  it("allows non-operational prompts for groq", () => {
    const policy = resolveModelTaskClassPolicy({
      provider: "groq",
      commandBody: "write a short haiku about tests",
    });
    expect(policy).toMatchObject({
      blocked: false,
      taskClass: "general",
    });
  });

  it("allows operational prompts for deterministic lanes", () => {
    const policy = resolveModelTaskClassPolicy({
      provider: "openai",
      commandBody: "gog gmail search newer_than:1d",
    });
    expect(policy).toMatchObject({
      blocked: false,
      taskClass: "operational_routing_tool_use_triage",
    });
  });
});
