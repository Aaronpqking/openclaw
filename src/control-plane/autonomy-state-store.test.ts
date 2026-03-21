import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAutonomyStateForSession,
  updateAutonomyStateFromTaskPacket,
} from "./autonomy-state-store.js";

describe("autonomy-state-store", () => {
  it("creates a file-backed autonomy state from the first task packet", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-autonomy-state-"));
    const taskPacket = {
      requestId: "req-1",
      runId: "run-1",
      scope: "project" as const,
      project: "eleanor" as const,
      build: "autonomy" as const,
      phase: "implement" as const,
      objective: "Wire first pass",
      allowedActionScopes: ["external_runtime" as const],
      replyMode: "summary" as const,
      constraints: ["need credentials"],
      acceptance: ["verify smoke"],
      initiationSource: "operator_requested" as const,
    };

    const state = await updateAutonomyStateFromTaskPacket({
      taskPacket,
      sessionKey: "agent:eleanor:main",
      explicitStateDir: stateDir,
      verificationState: "partial",
      lastResult: "ingress accepted",
    });

    expect(state.lastTaskPacketRef).toBe("req-1");
    expect(state.lastRunId).toBe("run-1");
    expect(state.blockers).toEqual(["need credentials"]);
    expect(state.nextActions).toEqual(["verify smoke"]);
    expect(state.verificationState).toBe("partial");
    const stateFile = path.join(stateDir, "control-plane", "autonomy-state.json");
    const onDisk = JSON.parse(await fs.readFile(stateFile, "utf8")) as {
      version: number;
      states: Record<string, { lastTaskPacketRef?: string }>;
      sessionIndex?: Record<string, string>;
    };
    expect(onDisk.version).toBe(2);
    expect(onDisk.states["req-1"]?.lastTaskPacketRef).toBe("req-1");
    expect(onDisk.sessionIndex?.["agent:eleanor:main"]).toBe("req-1");
  });

  it("updates existing state by request id key", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-autonomy-state-"));
    const basePacket = {
      requestId: "req-2",
      scope: "project" as const,
      project: "eleanor" as const,
      build: "execution" as const,
      phase: "implement" as const,
      objective: "Run task",
      allowedActionScopes: ["external_runtime" as const],
      replyMode: "summary" as const,
      initiationSource: "self_driven" as const,
    };

    await updateAutonomyStateFromTaskPacket({
      taskPacket: basePacket,
      explicitStateDir: stateDir,
    });
    const updated = await updateAutonomyStateFromTaskPacket({
      taskPacket: { ...basePacket, phase: "verify", evidenceRefs: ["artifact://proof"] },
      explicitStateDir: stateDir,
      verificationState: "passed_scoped",
      lastResult: "verification passed",
      runId: "run-2",
    });

    expect(updated.phase).toBe("verify");
    expect(updated.lastEvidenceRefs).toEqual(["artifact://proof"]);
    expect(updated.lastResult).toBe("verification passed");
    expect(updated.verificationState).toBe("passed_scoped");
    expect(updated.lastRunId).toBe("run-2");
  });

  it("uses taskPacket.runId when no explicit runId override is provided", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-autonomy-state-"));
    const state = await updateAutonomyStateFromTaskPacket({
      taskPacket: {
        requestId: "req-3",
        runId: "run-from-packet",
        scope: "project",
        project: "eleanor",
        build: "execution",
        phase: "implement",
        objective: "Use packet run id",
        allowedActionScopes: ["external_runtime"],
        replyMode: "summary",
      },
      explicitStateDir: stateDir,
    });

    expect(state.lastRunId).toBe("run-from-packet");
  });

  it("loads the latest state by session key", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-autonomy-state-"));
    await updateAutonomyStateFromTaskPacket({
      taskPacket: {
        requestId: "req-4",
        scope: "project",
        project: "eleanor",
        build: "autonomy",
        phase: "verify",
        objective: "Compile context",
        allowedActionScopes: ["cursor_workspace", "operator_thread"],
        replyMode: "checkpoint",
        initiationSource: "operator_requested",
        reportTargets: [{ channel: "whatsapp", target: "+15550001111", immediate: true }],
      },
      sessionKey: "agent:eleanor:main",
      explicitStateDir: stateDir,
      verificationState: "passed_scoped",
      lastResult: "compiler ready",
    });

    const state = await getAutonomyStateForSession({
      sessionKey: "agent:eleanor:main",
      explicitStateDir: stateDir,
    });

    expect(state?.phase).toBe("verify");
    expect(state?.allowedActionScopes).toEqual(["cursor_workspace", "operator_thread"]);
    expect(state?.reportTargets).toEqual([
      { channel: "whatsapp", target: "+15550001111", immediate: true },
    ]);
  });
});
