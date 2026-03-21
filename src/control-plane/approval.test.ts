import { describe, expect, it } from "vitest";
import {
  resolveApprovalPolicy,
  resolveEleanorLiteExecApprovalHints,
  resolveMessageActionClass,
  resolveMessageActionScope,
} from "./approval.js";

describe("resolveApprovalPolicy", () => {
  it("allows explicit operator-requested sends without another approval", () => {
    const result = resolveApprovalPolicy({
      initiationSource: "operator_requested",
      actionScope: "external_runtime",
      actionClass: "send",
      allowedActionScopes: ["external_runtime"],
      reportTargets: [{ channel: "whatsapp", target: "+15550001111", immediate: true }],
    });

    expect(result.allowed).toBe(true);
    expect(result.approvalMode).toBe("bounded_auto");
    expect(result.deliveryState).toBe("queued");
    expect(result.reportImmediately).toBe(true);
  });

  it("requires approval for self-driven sends", () => {
    const result = resolveApprovalPolicy({
      initiationSource: "self_driven",
      actionScope: "external_runtime",
      actionClass: "send",
      allowedActionScopes: ["external_runtime"],
    });

    expect(result.allowed).toBe(false);
    expect(result.approvalMode).toBe("explicit");
    expect(result.deliveryState).toBe("approval_required");
  });

  it("blocks out-of-scope actions even when operator-requested", () => {
    const result = resolveApprovalPolicy({
      initiationSource: "operator_requested",
      actionScope: "tenant_surface",
      actionClass: "send",
      allowedActionScopes: ["cursor_workspace"],
    });

    expect(result.allowed).toBe(false);
    expect(result.deliveryState).toBe("blocked");
  });
});

describe("resolveEleanorLiteExecApprovalHints", () => {
  const basePacket = {
    requestId: "r1",
    scope: "project" as const,
    project: "eleanor" as const,
    build: "execution" as const,
    phase: "implement" as const,
    objective: "test",
    allowedActionScopes: ["external_runtime" as const],
    replyMode: "summary" as const,
  };

  it("skips exec approval prompt for operator-requested Eleanor Lite packets", () => {
    const hints = resolveEleanorLiteExecApprovalHints({
      taskPacket: {
        ...basePacket,
        initiationSource: "operator_requested",
      },
    });
    expect(hints.skipApprovalPrompt).toBe(true);
    expect(hints.forceRequireApproval).toBe(false);
    expect(hints.blockReason).toBeUndefined();
  });

  it("forces exec approval for self-driven sends (non-exec class still applies to other tools)", () => {
    const hints = resolveEleanorLiteExecApprovalHints({
      taskPacket: {
        ...basePacket,
        initiationSource: "self_driven",
      },
      actionClass: "send",
    });
    expect(hints.forceRequireApproval).toBe(true);
    expect(hints.skipApprovalPrompt).toBe(false);
  });

  it("returns blocked when action scope is not allowed", () => {
    const hints = resolveEleanorLiteExecApprovalHints({
      taskPacket: {
        ...basePacket,
        initiationSource: "operator_requested",
        allowedActionScopes: ["cursor_workspace"],
      },
      defaultActionScope: "external_runtime",
    });
    expect(hints.blockReason).toBeDefined();
  });

  it("ignores non-Eleanor projects", () => {
    const hints = resolveEleanorLiteExecApprovalHints({
      taskPacket: { ...basePacket, project: "openclaw" },
    });
    expect(hints.skipApprovalPrompt).toBe(false);
    expect(hints.forceRequireApproval).toBe(false);
  });
});

describe("message action helpers", () => {
  it("maps send-like actions to the send control class", () => {
    expect(resolveMessageActionClass("thread-reply")).toBe("send");
  });

  it("maps report-target sends to operator_thread scope", () => {
    expect(
      resolveMessageActionScope({
        taskPacket: {
          requestId: "r2",
          scope: "project",
          project: "eleanor",
          build: "execution",
          phase: "report",
          objective: "report",
          allowedActionScopes: ["operator_thread"],
          replyMode: "summary",
          reportTargets: [{ channel: "whatsapp", target: "+15550001111", immediate: true }],
        },
        channel: "whatsapp",
        target: "+15550001111",
      }),
    ).toBe("operator_thread");
  });
});
