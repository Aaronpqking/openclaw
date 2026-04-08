import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as agentEvents from "../infra/agent-events.js";
import type { MessagingToolSend } from "./pi-embedded-messaging.js";
import {
  consumeRouteAuditSummaryForRun,
  handleToolExecutionEnd,
  handleToolExecutionStart,
  peekRouteAuditSummaryForRun,
} from "./pi-embedded-subscribe.handlers.tools.js";
import type {
  ToolCallSummary,
  ToolHandlerContext,
} from "./pi-embedded-subscribe.handlers.types.js";
import { initializeRetrievalTraceForRun, peekRetrievalTraceForRun } from "./retrieval-trace.js";

type ToolExecutionStartEvent = Extract<AgentEvent, { type: "tool_execution_start" }>;
type ToolExecutionEndEvent = Extract<AgentEvent, { type: "tool_execution_end" }>;

const emitAgentEventSpy = vi
  .spyOn(agentEvents, "emitAgentEvent")
  .mockImplementation(() => undefined);

beforeEach(() => {
  emitAgentEventSpy.mockClear();
});

function createTestContext(): {
  ctx: ToolHandlerContext;
  warn: ReturnType<typeof vi.fn>;
  onBlockReplyFlush: ReturnType<typeof vi.fn>;
} {
  const onBlockReplyFlush = vi.fn();
  const warn = vi.fn();
  const ctx: ToolHandlerContext = {
    params: {
      runId: "run-test",
      onBlockReplyFlush,
      onAgentEvent: undefined,
      onToolResult: undefined,
    },
    flushBlockReplyBuffer: vi.fn(),
    hookRunner: undefined,
    log: {
      debug: vi.fn(),
      warn,
    },
    state: {
      toolMetaById: new Map<string, ToolCallSummary>(),
      toolMetas: [],
      toolSummaryById: new Set<string>(),
      pendingMessagingTargets: new Map<string, MessagingToolSend>(),
      pendingMessagingTexts: new Map<string, string>(),
      pendingMessagingMediaUrls: new Map<string, string[]>(),
      messagingToolSentTexts: [],
      messagingToolSentTextsNormalized: [],
      messagingToolSentMediaUrls: [],
      messagingToolSentTargets: [],
      successfulCronAdds: 0,
      deterministicApprovalPromptSent: false,
    },
    shouldEmitToolResult: () => false,
    shouldEmitToolOutput: () => false,
    emitToolSummary: vi.fn(),
    emitToolOutput: vi.fn(),
    trimMessagingToolSent: vi.fn(),
  };

  return { ctx, warn, onBlockReplyFlush };
}

describe("handleToolExecutionStart read path checks", () => {
  it("does not warn when read tool uses file_path alias", async () => {
    const { ctx, warn, onBlockReplyFlush } = createTestContext();

    const evt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "read",
      toolCallId: "tool-1",
      args: { file_path: "/tmp/example.txt" },
    };

    await handleToolExecutionStart(ctx, evt);

    expect(onBlockReplyFlush).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when read tool has neither path nor file_path", async () => {
    const { ctx, warn } = createTestContext();

    const evt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "read",
      toolCallId: "tool-2",
      args: {},
    };

    await handleToolExecutionStart(ctx, evt);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0] ?? "")).toContain("read tool called without path");
  });

  it("awaits onBlockReplyFlush before continuing tool start processing", async () => {
    const { ctx, onBlockReplyFlush } = createTestContext();
    let releaseFlush: (() => void) | undefined;
    onBlockReplyFlush.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseFlush = resolve;
        }),
    );

    const evt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "exec",
      toolCallId: "tool-await-flush",
      args: { command: "echo hi" },
    };

    const pending = handleToolExecutionStart(ctx, evt);
    // Let the async function reach the awaited flush Promise.
    await Promise.resolve();

    // If flush isn't awaited, tool metadata would already be recorded here.
    expect(ctx.state.toolMetaById.has("tool-await-flush")).toBe(false);
    expect(releaseFlush).toBeTypeOf("function");

    releaseFlush?.();
    await pending;

    expect(ctx.state.toolMetaById.has("tool-await-flush")).toBe(true);
  });
});

describe("handleToolExecutionEnd cron.add commitment tracking", () => {
  it("increments successfulCronAdds when cron add succeeds", async () => {
    const { ctx } = createTestContext();
    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "cron",
        toolCallId: "tool-cron-1",
        args: { action: "add", job: { name: "reminder" } },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "cron",
        toolCallId: "tool-cron-1",
        isError: false,
        result: { details: { status: "ok" } },
      } as never,
    );

    expect(ctx.state.successfulCronAdds).toBe(1);
  });

  it("does not increment successfulCronAdds when cron add fails", async () => {
    const { ctx } = createTestContext();
    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "cron",
        toolCallId: "tool-cron-2",
        args: { action: "add", job: { name: "reminder" } },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "cron",
        toolCallId: "tool-cron-2",
        isError: true,
        result: { details: { status: "error" } },
      } as never,
    );

    expect(ctx.state.successfulCronAdds).toBe(0);
  });
});

describe("handleToolExecutionEnd memory retrieval trace tracking", () => {
  it("marks current daily memory when read tool accesses memory/YYYY-MM-DD.md", async () => {
    const { ctx } = createTestContext();
    initializeRetrievalTraceForRun("run-test", {
      prompt: "recall todays marker",
      requestedModel: "openai/gpt-5.4-mini",
      resolvedModel: "openai/gpt-5.4-mini",
    });

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "read",
        toolCallId: "tool-read-memory",
        args: { path: "/home/node/.openclaw/workspace/memory/2026-04-08.md" },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "read",
        toolCallId: "tool-read-memory",
        isError: false,
        result: {
          content: [{ type: "text", text: "ok" }],
        },
      } as never,
    );

    expect(peekRouteAuditSummaryForRun("run-test")).toMatchObject({
      task_completed_verified: false,
    });
    expect(peekRetrievalTraceForRun("run-test")).toMatchObject({
      selected_layer: "current_daily_memory",
      escalated_to_live_source: false,
    });
  });

  it("marks current daily memory when memory_search returns a current-day result", async () => {
    const { ctx } = createTestContext();
    initializeRetrievalTraceForRun("run-test", {
      prompt: "What memory proof token was saved today?",
      requestedModel: "openai/gpt-5.4-mini",
      resolvedModel: "openai/gpt-5.4-mini",
    });

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "memory_search",
        toolCallId: "tool-memory-search",
        args: { query: "What memory proof token was saved today?" },
      } as never,
    );

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "memory_search",
        toolCallId: "tool-memory-search",
        isError: false,
        result: {
          details: {
            results: [
              {
                path: "memory/2026-04-08.md",
                snippet: "## Memory proof\n- token: MEMPROOF-2026-04-08-0406Z",
              },
            ],
          },
        },
      } as never,
    );

    expect(peekRetrievalTraceForRun("run-test")).toMatchObject({
      selected_layer: "current_daily_memory",
      escalated_to_live_source: false,
      freshness_required: false,
    });
  });
});

describe("handleToolExecutionEnd exec approval prompts", () => {
  it("emits a deterministic approval payload and marks assistant output suppressed", async () => {
    const { ctx } = createTestContext();
    const onToolResult = vi.fn();
    ctx.params.onToolResult = onToolResult;

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-exec-approval",
        isError: false,
        result: {
          details: {
            status: "approval-pending",
            approvalId: "12345678-1234-1234-1234-123456789012",
            approvalSlug: "12345678",
            expiresAtMs: 1_800_000_000_000,
            host: "gateway",
            command: "npm view diver name version description",
            cwd: "/tmp/work",
            warningText: "Warning: heredoc execution requires explicit approval in allowlist mode.",
          },
        },
      } as never,
    );

    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          "```txt\n/approve 12345678-1234-1234-1234-123456789012 allow-once\n```",
        ),
        channelData: {
          execApproval: {
            approvalId: "12345678-1234-1234-1234-123456789012",
            approvalSlug: "12345678",
            allowedDecisions: ["allow-once", "allow-always", "deny"],
          },
        },
      }),
    );
    expect(ctx.state.deterministicApprovalPromptSent).toBe(true);
  });

  it("emits a deterministic unavailable payload when the initiating surface cannot approve", async () => {
    const { ctx } = createTestContext();
    const onToolResult = vi.fn();
    ctx.params.onToolResult = onToolResult;

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-exec-unavailable",
        isError: false,
        result: {
          details: {
            status: "approval-unavailable",
            reason: "initiating-platform-disabled",
            channelLabel: "Discord",
          },
        },
      } as never,
    );

    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("chat exec approvals are not enabled on Discord"),
      }),
    );
    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.not.stringContaining("/approve"),
      }),
    );
    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.not.stringContaining("Pending command:"),
      }),
    );
    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.not.stringContaining("Host:"),
      }),
    );
    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.not.stringContaining("CWD:"),
      }),
    );
    expect(ctx.state.deterministicApprovalPromptSent).toBe(true);
  });

  it("emits the shared approver-DM notice when another approval client received the request", async () => {
    const { ctx } = createTestContext();
    const onToolResult = vi.fn();
    ctx.params.onToolResult = onToolResult;

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-exec-unavailable-dm-redirect",
        isError: false,
        result: {
          details: {
            status: "approval-unavailable",
            reason: "initiating-platform-disabled",
            channelLabel: "Telegram",
            sentApproverDms: true,
          },
        },
      } as never,
    );

    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Approval required. I sent the allowed approvers DMs.",
      }),
    );
    expect(ctx.state.deterministicApprovalPromptSent).toBe(true);
  });

  it("does not suppress assistant output when deterministic prompt delivery rejects", async () => {
    const { ctx } = createTestContext();
    ctx.params.onToolResult = vi.fn(async () => {
      throw new Error("delivery failed");
    });

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-exec-approval-reject",
        isError: false,
        result: {
          details: {
            status: "approval-pending",
            approvalId: "12345678-1234-1234-1234-123456789012",
            approvalSlug: "12345678",
            expiresAtMs: 1_800_000_000_000,
            host: "gateway",
            command: "npm view diver name version description",
            cwd: "/tmp/work",
          },
        },
      } as never,
    );

    expect(ctx.state.deterministicApprovalPromptSent).toBe(false);
  });
});

describe("route audit telemetry", () => {
  it("emits model and verification fields for gog route selection", async () => {
    const { ctx } = createTestContext();
    ctx.params.runId = "run-route-gog";
    initializeRetrievalTraceForRun("run-route-gog", {
      prompt: "check inbox updates",
      requestedModel: "openai/gpt-5.4-mini",
      resolvedModel: "openai/gpt-5.4-mini",
    });

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "exec",
        toolCallId: "tool-gog-start",
        args: { command: "gog gmail search newer_than:1d --max 5" },
      } as never,
    );
    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-gog-start",
        isError: false,
        result: { ok: true },
      } as never,
    );

    const lifecycleEvents = emitAgentEventSpy.mock.calls
      .map((call) => call[0])
      .filter((evt) => evt?.stream === "lifecycle")
      .map((evt) => evt.data);
    const selected = lifecycleEvents.find((evt) => evt.reasonCode === "gog_exec_route_selected");
    const verified = lifecycleEvents.find((evt) => evt.reasonCode === "task_completed_verified");

    expect(selected).toMatchObject({
      phase: "route_audit",
      requested_model: "openai/gpt-5.4-mini",
      resolved_model: "openai/gpt-5.4-mini",
      gog_attempted: true,
    });
    expect(verified).toMatchObject({
      phase: "route_audit",
      final_status: "verified_success",
      verification_status: "verified",
    });
  });

  it("marks shell_probe_attempted when non-gog probe is blocked", async () => {
    const { ctx } = createTestContext();
    ctx.params.runId = "run-route-probe";
    initializeRetrievalTraceForRun("run-route-probe", {
      prompt: "check gmail inbox",
      requestedModel: "openai/gpt-5.4-mini",
      resolvedModel: "openai/gpt-5.4-mini",
    });

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-probe-blocked",
        isError: true,
        result: {
          error:
            "[route:exec_route_not_applicable] Non-gog shell probe blocked for Google Workspace task.",
        },
      } as never,
    );

    const lifecycleEvents = emitAgentEventSpy.mock.calls
      .map((call) => call[0])
      .filter((evt) => evt?.stream === "lifecycle")
      .map((evt) => evt.data);
    expect(lifecycleEvents).toContainEqual(
      expect.objectContaining({
        phase: "route_audit",
        reasonCode: "exec_route_not_applicable",
        shell_probe_attempted: true,
        final_status: "blocked_non_gog_probe",
      }),
    );
  });

  it("emits route_fallback_used when browser route fails before gog succeeds", async () => {
    const { ctx } = createTestContext();
    ctx.params.runId = "run-route-browser-fallback";
    initializeRetrievalTraceForRun("run-route-browser-fallback", {
      prompt: "check gmail updates",
      requestedModel: "openai/gpt-5.4-mini",
      resolvedModel: "openai/gpt-5.4-mini",
    });

    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "browser",
        toolCallId: "tool-browser-fail",
        isError: true,
        result: { error: "browser attach failed: gateway noVNC unavailable" },
      } as never,
    );
    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "exec",
        toolCallId: "tool-gog-after-browser",
        args: { command: "gog gmail search newer_than:1d --max 5" },
      } as never,
    );

    const lifecycleEvents = emitAgentEventSpy.mock.calls
      .map((call) => call[0])
      .filter((evt) => evt?.stream === "lifecycle")
      .map((evt) => evt.data);
    expect(lifecycleEvents).toContainEqual(
      expect.objectContaining({
        phase: "route_audit",
        reasonCode: "route_fallback_used",
        route_chosen: "gog_exec",
        final_status: "recovered_after_block",
      }),
    );
  });

  it("exposes task_completed_verified via route audit summary consumption", async () => {
    const { ctx } = createTestContext();
    ctx.params.runId = "run-route-summary";
    initializeRetrievalTraceForRun("run-route-summary", {
      prompt: "check gmail updates",
      requestedModel: "openai/gpt-5.4",
      resolvedModel: "openai/gpt-5.4",
    });

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "exec",
        toolCallId: "tool-summary-start",
        args: { command: "gog gmail search newer_than:1d --max 1" },
      } as never,
    );
    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-summary-start",
        isError: false,
        result: { ok: true },
      } as never,
    );

    expect(consumeRouteAuditSummaryForRun("run-route-summary")).toMatchObject({
      gog_attempted: true,
      task_completed_verified: true,
    });
    expect(consumeRouteAuditSummaryForRun("run-route-summary")).toBeNull();
  });

  it("peeks route audit summary without consuming it", async () => {
    const { ctx } = createTestContext();
    ctx.params.runId = "run-route-peek";
    initializeRetrievalTraceForRun("run-route-peek", {
      prompt: "check gmail updates",
      requestedModel: "openai/gpt-5.4-mini",
      resolvedModel: "openai/gpt-5.4-mini",
    });

    await handleToolExecutionStart(
      ctx as never,
      {
        type: "tool_execution_start",
        toolName: "exec",
        toolCallId: "tool-peek-start",
        args: { command: "gog gmail search newer_than:1d --max 1" },
      } as never,
    );
    await handleToolExecutionEnd(
      ctx as never,
      {
        type: "tool_execution_end",
        toolName: "exec",
        toolCallId: "tool-peek-start",
        isError: false,
        result: { ok: true },
      } as never,
    );

    expect(peekRouteAuditSummaryForRun("run-route-peek")).toMatchObject({
      gog_attempted: true,
      task_completed_verified: true,
    });
    expect(consumeRouteAuditSummaryForRun("run-route-peek")).toMatchObject({
      gog_attempted: true,
      task_completed_verified: true,
    });
    expect(peekRouteAuditSummaryForRun("run-route-peek")).toBeNull();
  });
});

describe("messaging tool media URL tracking", () => {
  it("tracks media arg from messaging tool as pending", async () => {
    const { ctx } = createTestContext();

    const evt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "message",
      toolCallId: "tool-m1",
      args: { action: "send", to: "channel:123", content: "hi", media: "file:///img.jpg" },
    };

    await handleToolExecutionStart(ctx, evt);

    expect(ctx.state.pendingMessagingMediaUrls.get("tool-m1")).toEqual(["file:///img.jpg"]);
  });

  it("commits pending media URL on tool success", async () => {
    const { ctx } = createTestContext();

    // Simulate start
    const startEvt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "message",
      toolCallId: "tool-m2",
      args: { action: "send", to: "channel:123", content: "hi", media: "file:///img.jpg" },
    };

    await handleToolExecutionStart(ctx, startEvt);

    // Simulate successful end
    const endEvt: ToolExecutionEndEvent = {
      type: "tool_execution_end",
      toolName: "message",
      toolCallId: "tool-m2",
      isError: false,
      result: { ok: true },
    };

    await handleToolExecutionEnd(ctx, endEvt);

    expect(ctx.state.messagingToolSentMediaUrls).toContain("file:///img.jpg");
    expect(ctx.state.pendingMessagingMediaUrls.has("tool-m2")).toBe(false);
  });

  it("commits mediaUrls from tool result payload", async () => {
    const { ctx } = createTestContext();

    const startEvt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "message",
      toolCallId: "tool-m2b",
      args: { action: "send", to: "channel:123", content: "hi" },
    };
    await handleToolExecutionStart(ctx, startEvt);

    const endEvt: ToolExecutionEndEvent = {
      type: "tool_execution_end",
      toolName: "message",
      toolCallId: "tool-m2b",
      isError: false,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mediaUrls: ["file:///img-a.jpg", "file:///img-b.jpg"],
            }),
          },
        ],
      },
    };
    await handleToolExecutionEnd(ctx, endEvt);

    expect(ctx.state.messagingToolSentMediaUrls).toEqual([
      "file:///img-a.jpg",
      "file:///img-b.jpg",
    ]);
  });

  it("trims messagingToolSentMediaUrls to 200 on commit (FIFO)", async () => {
    const { ctx } = createTestContext();

    // Replace mock with a real trim that replicates production cap logic.
    const MAX = 200;
    ctx.trimMessagingToolSent = () => {
      if (ctx.state.messagingToolSentTexts.length > MAX) {
        const overflow = ctx.state.messagingToolSentTexts.length - MAX;
        ctx.state.messagingToolSentTexts.splice(0, overflow);
        ctx.state.messagingToolSentTextsNormalized.splice(0, overflow);
      }
      if (ctx.state.messagingToolSentTargets.length > MAX) {
        const overflow = ctx.state.messagingToolSentTargets.length - MAX;
        ctx.state.messagingToolSentTargets.splice(0, overflow);
      }
      if (ctx.state.messagingToolSentMediaUrls.length > MAX) {
        const overflow = ctx.state.messagingToolSentMediaUrls.length - MAX;
        ctx.state.messagingToolSentMediaUrls.splice(0, overflow);
      }
    };

    // Pre-fill with 200 URLs (url-0 .. url-199)
    for (let i = 0; i < 200; i++) {
      ctx.state.messagingToolSentMediaUrls.push(`file:///img-${i}.jpg`);
    }
    expect(ctx.state.messagingToolSentMediaUrls).toHaveLength(200);

    // Commit one more via start → end
    const startEvt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "message",
      toolCallId: "tool-cap",
      args: { action: "send", to: "channel:123", content: "hi", media: "file:///img-new.jpg" },
    };
    await handleToolExecutionStart(ctx, startEvt);

    const endEvt: ToolExecutionEndEvent = {
      type: "tool_execution_end",
      toolName: "message",
      toolCallId: "tool-cap",
      isError: false,
      result: { ok: true },
    };
    await handleToolExecutionEnd(ctx, endEvt);

    // Should be capped at 200, oldest removed, newest appended.
    expect(ctx.state.messagingToolSentMediaUrls).toHaveLength(200);
    expect(ctx.state.messagingToolSentMediaUrls[0]).toBe("file:///img-1.jpg");
    expect(ctx.state.messagingToolSentMediaUrls[199]).toBe("file:///img-new.jpg");
    expect(ctx.state.messagingToolSentMediaUrls).not.toContain("file:///img-0.jpg");
  });

  it("discards pending media URL on tool error", async () => {
    const { ctx } = createTestContext();

    const startEvt: ToolExecutionStartEvent = {
      type: "tool_execution_start",
      toolName: "message",
      toolCallId: "tool-m3",
      args: { action: "send", to: "channel:123", content: "hi", media: "file:///img.jpg" },
    };

    await handleToolExecutionStart(ctx, startEvt);

    const endEvt: ToolExecutionEndEvent = {
      type: "tool_execution_end",
      toolName: "message",
      toolCallId: "tool-m3",
      isError: true,
      result: "Error: failed",
    };

    await handleToolExecutionEnd(ctx, endEvt);

    expect(ctx.state.messagingToolSentMediaUrls).toHaveLength(0);
    expect(ctx.state.pendingMessagingMediaUrls.has("tool-m3")).toBe(false);
  });
});
