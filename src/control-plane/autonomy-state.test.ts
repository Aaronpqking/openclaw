import { describe, expect, it } from "vitest";
import {
  createAutonomyState,
  recordAutonomyWriteback,
  resolveNextAutonomyAction,
} from "./autonomy-state.js";

describe("autonomy state helpers", () => {
  it("records writeback details and preserves unique lists", () => {
    const state = createAutonomyState({
      project: "openclaw",
      build: "autonomy",
      phase: "implement",
      objective: "Ship bounded autonomy",
      blockers: [],
      nextActions: ["context_compile", "context_compile", "verify"],
      verificationState: "not_started",
      authorityLevel: "T1",
    });

    const updated = recordAutonomyWriteback(state, {
      blockers: ["needs approval", "needs approval"],
      nextActions: ["verify"],
      verificationState: "partial",
      lastRunId: "run-1",
      lastTaskPacketRef: "req-1",
      lastEvidenceRefs: ["artifact://1", "artifact://1"],
      lastResult: "packet parsed",
    });

    expect(updated.blockers).toEqual(["needs approval"]);
    expect(updated.nextActions).toEqual(["verify"]);
    expect(updated.lastEvidenceRefs).toEqual(["artifact://1"]);
    expect(updated.lastRunId).toBe("run-1");
    expect(resolveNextAutonomyAction(updated)).toBe("verify");
  });

  it("returns no next action when blocked", () => {
    const state = createAutonomyState({
      project: "openclaw",
      build: "autonomy",
      phase: "blocked",
      objective: "Ship bounded autonomy",
      blockers: ["needs approval"],
      nextActions: ["verify"],
      verificationState: "blocked",
      authorityLevel: "T1",
    });

    expect(resolveNextAutonomyAction(state)).toBeNull();
  });
});
