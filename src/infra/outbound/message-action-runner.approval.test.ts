import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { runMessageAction } from "./message-action-runner.js";

vi.mock("./channel-selection.js", () => ({
  resolveMessageChannelSelection: vi.fn(async ({ channel }: { channel?: string }) => ({
    channel: channel ?? "whatsapp",
    source: "explicit",
  })),
  listConfiguredMessageChannels: vi.fn(async () => ["whatsapp"]),
}));

vi.mock("./target-resolver.js", () => ({
  resolveChannelTarget: vi.fn(async ({ input }: { input: string }) => ({
    ok: true,
    target: { to: input, kind: "user" },
  })),
}));

vi.mock("./message-action-params.js", () => ({
  hydrateAttachmentParamsForAction: vi.fn(async () => {}),
  normalizeSandboxMediaList: vi.fn(async ({ values }: { values: string[] }) => values),
  normalizeSandboxMediaParams: vi.fn(async () => {}),
  parseButtonsParam: vi.fn(() => {}),
  parseCardParam: vi.fn(() => {}),
  parseComponentsParam: vi.fn(() => {}),
  parseInteractiveParam: vi.fn(() => {}),
  readBooleanParam: vi.fn((params: Record<string, unknown>, key: string) =>
    typeof params[key] === "boolean" ? params[key] : undefined,
  ),
  resolveAttachmentMediaPolicy: vi.fn(() => ({})),
}));

vi.mock("./channel-resolution.js", () => ({
  resolveOutboundChannelPlugin: vi.fn(() => null),
}));

vi.mock("./outbound-send-service.js", () => ({
  executeSendAction: vi.fn(async ({ to, message }: { to: string; message: string }) => ({
    handledBy: "core",
    payload: { ok: true, to, message },
    sendResult: { ok: true, messageId: "msg-1" },
  })),
  executePollAction: vi.fn(async () => ({
    handledBy: "core",
    payload: { ok: true },
    pollResult: { ok: true, pollId: "poll-1" },
  })),
}));

vi.mock("./outbound-policy.js", () => ({
  applyCrossContextDecoration: vi.fn(({ message }: { message: string }) => ({ message })),
  buildCrossContextDecoration: vi.fn(async () => null),
  enforceCrossContextPolicy: vi.fn(() => {}),
  shouldApplyCrossContextMarker: vi.fn(() => false),
}));

vi.mock("./outbound-session.js", () => ({
  ensureOutboundSessionEntry: vi.fn(async () => {}),
  resolveOutboundSessionRoute: vi.fn(async () => null),
}));

vi.mock("../../routing/bindings.js", () => ({
  buildChannelAccountBindings: vi.fn(() => new Map()),
}));

describe("runMessageAction approval policy", () => {
  const cfg = {} as OpenClawConfig;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks self-driven Eleanor sends without approval", async () => {
    await expect(
      runMessageAction({
        cfg,
        action: "send",
        params: {
          channel: "whatsapp",
          target: "+15550001111",
          message: "status",
        },
        taskPacket: {
          requestId: "req-1",
          scope: "project",
          project: "eleanor",
          build: "execution",
          phase: "implement",
          objective: "send status",
          allowedActionScopes: ["external_runtime"],
          replyMode: "summary",
          initiationSource: "self_driven",
        },
      }),
    ).rejects.toThrow(/requires approval/);
  });

  it("allows operator-requested Eleanor sends within scope", async () => {
    const result = await runMessageAction({
      cfg,
      action: "send",
      params: {
        channel: "whatsapp",
        target: "+15550001111",
        message: "status",
      },
      taskPacket: {
        requestId: "req-2",
        scope: "project",
        project: "eleanor",
        build: "execution",
        phase: "implement",
        objective: "send status",
        allowedActionScopes: ["external_runtime"],
        replyMode: "summary",
        initiationSource: "operator_requested",
      },
    });

    expect(result.kind).toBe("send");
    expect(result.dryRun).toBe(false);
  });
});
