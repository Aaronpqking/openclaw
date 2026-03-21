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

  it("prevents unsafe phase regressions and records a blocker warning", () => {
    const state = createAutonomyState({
      project: "openclaw",
      build: "autonomy",
      phase: "verify",
      objective: "Ship bounded autonomy",
      blockers: [],
      nextActions: ["report"],
      verificationState: "partial",
      authorityLevel: "T1",
    });

    const updated = recordAutonomyWriteback(state, {
      phase: "design",
    });

    expect(updated.phase).toBe("verify");
    expect(updated.blockers).toContain("phase transition denied: verify -> design");
  });

  it("allows explicit rollback from verify to repair", () => {
    const state = createAutonomyState({
      project: "openclaw",
      build: "autonomy",
      phase: "verify",
      objective: "Validate release",
      blockers: [],
      nextActions: ["report"],
      verificationState: "partial",
      authorityLevel: "T1",
    });

    const updated = recordAutonomyWriteback(state, {
      phase: "repair",
    });

    expect(updated.phase).toBe("repair");
  });

  it("allows hold-phase resume back to active execution phases", () => {
    const state = createAutonomyState({
      project: "openclaw",
      build: "autonomy",
      phase: "blocked",
      objective: "Resume after unblock",
      blockers: ["waiting on operator"],
      nextActions: ["implement"],
      verificationState: "blocked",
      authorityLevel: "T1",
    });

    const updated = recordAutonomyWriteback(state, {
      phase: "implement",
      verificationState: "partial",
    });

    expect(updated.phase).toBe("implement");
    expect(updated.verificationState).toBe("partial");
  });

  it("keeps complete as terminal unless complete is requested", () => {
    const state = createAutonomyState({
      project: "openclaw",
      build: "autonomy",
      phase: "complete",
      objective: "Finished",
      blockers: [],
      nextActions: [],
      verificationState: "passed_scoped",
      authorityLevel: "T1",
    });

    const updated = recordAutonomyWriteback(state, {
      phase: "implement",
    });

    expect(updated.phase).toBe("complete");
    expect(updated.blockers).toContain("phase transition denied: complete -> implement");
  });
});
