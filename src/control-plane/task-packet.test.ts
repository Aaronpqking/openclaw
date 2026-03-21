import { describe, expect, it } from "vitest";
import { parseTaskPacket } from "./task-packet.js";

describe("parseTaskPacket", () => {
  it("parses and de-duplicates a valid packet", () => {
    const packet = parseTaskPacket({
      requestId: "req-1",
      runId: "run-1",
      scope: "project",
      project: "openclaw",
      build: "execution",
      phase: "implement",
      objective: "Wire contract helpers",
      allowedActionScopes: ["cursor_workspace", "cursor_workspace", "operator_thread"],
      replyMode: "detailed",
      constraints: ["No destructive autonomy", "No destructive autonomy"],
      reportTargets: [
        { channel: "whatsapp", target: "+15550001111" },
        { channel: "operator_thread", target: "cursor" },
      ],
    });

    expect(packet.allowedActionScopes).toEqual(["cursor_workspace", "operator_thread"]);
    expect(packet.runId).toBe("run-1");
    expect(packet.constraints).toEqual(["No destructive autonomy"]);
    expect(packet.reportTargets).toEqual([
      { channel: "whatsapp", target: "+15550001111", immediate: true },
      { channel: "operator_thread", target: "cursor", immediate: true },
    ]);
  });

  it("rejects missing required fields", () => {
    expect(() =>
      parseTaskPacket({
        requestId: "req-1",
        scope: "project",
        project: "openclaw",
        build: "execution",
        phase: "implement",
        objective: "Wire contract helpers",
        replyMode: "detailed",
      }),
    ).toThrow(/allowedActionScopes/);
  });

  it("rejects blank run ids when provided", () => {
    expect(() =>
      parseTaskPacket({
        requestId: "req-1",
        runId: "   ",
        scope: "project",
        project: "openclaw",
        build: "execution",
        phase: "implement",
        objective: "Wire contract helpers",
        allowedActionScopes: ["cursor_workspace"],
        replyMode: "detailed",
      }),
    ).toThrow(/runId/);
  });

  it("keeps explicit report target immediate=false and allows omitted runId", () => {
    const packet = parseTaskPacket({
      requestId: "req-2",
      scope: "project",
      project: "eleanor",
      build: "execution",
      phase: "report",
      objective: "Send report",
      allowedActionScopes: ["external_runtime"],
      replyMode: "summary",
      reportTargets: [{ channel: "whatsapp", target: "+15550002222", immediate: false }],
    });

    expect(packet.runId).toBeUndefined();
    expect(packet.reportTargets).toEqual([
      { channel: "whatsapp", target: "+15550002222", immediate: false },
    ]);
  });
});
