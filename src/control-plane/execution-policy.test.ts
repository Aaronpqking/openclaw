import { describe, expect, it } from "vitest";
import { resolveExecutionPolicyDecision } from "./execution-policy.js";

describe("resolveExecutionPolicyDecision", () => {
  it("returns auto-approved decision for operator-thread sends", () => {
    const decision = resolveExecutionPolicyDecision({
      initiationSource: "operator_requested",
      actionScope: "operator_thread",
      actionClass: "send",
    });
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) {
      return;
    }
    expect(decision.approvalMode).toBe("none");
  });

  it("returns blocked for n/a matrix cells", () => {
    const decision = resolveExecutionPolicyDecision({
      initiationSource: "operator_requested",
      actionScope: "operator_thread",
      actionClass: "deploy",
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) {
      return;
    }
    expect(decision.deniedAs).toBe("blocked");
  });

  it("returns approval_required for explicit matrix cells", () => {
    const decision = resolveExecutionPolicyDecision({
      initiationSource: "self_driven",
      actionScope: "external_runtime",
      actionClass: "send",
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) {
      return;
    }
    expect(decision.deniedAs).toBe("approval_required");
    expect(decision.approvalMode).toBe("explicit");
  });

  it("uses conservative fallback for external-triggered observe actions", () => {
    const decision = resolveExecutionPolicyDecision({
      initiationSource: "external_triggered",
      actionScope: "external_runtime",
      actionClass: "read",
    });
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) {
      return;
    }
    expect(decision.approvalMode).toBe("bounded_auto");
  });
});
