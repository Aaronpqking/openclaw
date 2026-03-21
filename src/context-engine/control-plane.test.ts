import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { updateAutonomyStateFromTaskPacket } from "../control-plane/autonomy-state-store.js";
import { ControlPlaneContextEngine } from "./control-plane.js";

const originalStateDir = process.env.OPENCLAW_STATE_DIR;

describe("ControlPlaneContextEngine", () => {
  afterEach(() => {
    if (originalStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
      return;
    }
    process.env.OPENCLAW_STATE_DIR = originalStateDir;
  });

  it("adds control-plane state to the system prompt when session state exists", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-control-plane-state-"));
    process.env.OPENCLAW_STATE_DIR = stateDir;

    await updateAutonomyStateFromTaskPacket({
      taskPacket: {
        requestId: "req-1",
        scope: "project",
        project: "eleanor",
        build: "execution",
        phase: "implement",
        objective: "Ship first pass",
        allowedActionScopes: ["cursor_workspace", "external_runtime"],
        replyMode: "summary",
        initiationSource: "operator_requested",
        reportTargets: [{ channel: "whatsapp", target: "+15550001111", immediate: true }],
      },
      sessionKey: "agent:eleanor:main",
      lastResult: "task accepted",
      explicitStateDir: stateDir,
    });

    const engine = new ControlPlaneContextEngine();
    const assembled = await engine.assemble({
      sessionId: "session-1",
      sessionKey: "agent:eleanor:main",
      messages: [],
    });

    expect(assembled.systemPromptAddition).toContain("OpenClaw control-plane context:");
    expect(assembled.systemPromptAddition).toContain("eleanor/execution/implement");
    expect(assembled.systemPromptAddition).toContain("operator_requested");
    expect(assembled.systemPromptAddition).toContain("whatsapp:+15550001111");
  });
});
