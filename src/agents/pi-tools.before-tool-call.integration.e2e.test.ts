import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDiagnosticSessionStateForTest } from "../logging/diagnostic-session-state.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { toClientToolDefinitions, toToolDefinitions } from "./pi-tool-definition-adapter.js";
import { wrapToolWithAbortSignal } from "./pi-tools.abort.js";
import {
  __testing as beforeToolCallTesting,
  consumeAdjustedParamsForToolCall,
  wrapToolWithBeforeToolCallHook,
} from "./pi-tools.before-tool-call.js";

vi.mock("../plugins/hook-runner-global.js");

const mockGetGlobalHookRunner = vi.mocked(getGlobalHookRunner);

type HookRunnerMock = {
  hasHooks: ReturnType<typeof vi.fn>;
  runBeforeToolCall: ReturnType<typeof vi.fn>;
};

function installMockHookRunner(params?: {
  hasHooksReturn?: boolean;
  runBeforeToolCallImpl?: (...args: unknown[]) => unknown;
}) {
  const hookRunner: HookRunnerMock = {
    hasHooks:
      params?.hasHooksReturn === undefined
        ? vi.fn()
        : vi.fn(() => params.hasHooksReturn as boolean),
    runBeforeToolCall: params?.runBeforeToolCallImpl
      ? vi.fn(params.runBeforeToolCallImpl)
      : vi.fn(),
  };
  // oxlint-disable-next-line typescript/no-explicit-any
  mockGetGlobalHookRunner.mockReturnValue(hookRunner as any);
  return hookRunner;
}

describe("before_tool_call hook integration", () => {
  let hookRunner: HookRunnerMock;

  beforeEach(() => {
    resetDiagnosticSessionStateForTest();
    beforeToolCallTesting.adjustedParamsByToolCallId.clear();
    hookRunner = installMockHookRunner();
  });

  it("executes tool normally when no hook is registered", async () => {
    hookRunner.hasHooks.mockReturnValue(false);
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "Read", execute } as any, {
      agentId: "main",
      sessionKey: "main",
    });
    const extensionContext = {} as Parameters<typeof tool.execute>[3];

    await tool.execute("call-1", { path: "/tmp/file" }, undefined, extensionContext);

    expect(hookRunner.runBeforeToolCall).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      "call-1",
      { path: "/tmp/file" },
      undefined,
      extensionContext,
    );
  });

  it("allows hook to modify parameters", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue({ params: { mode: "safe" } });
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "exec", execute } as any);
    const extensionContext = {} as Parameters<typeof tool.execute>[3];

    await tool.execute("call-2", { cmd: "ls" }, undefined, extensionContext);

    expect(execute).toHaveBeenCalledWith(
      "call-2",
      { cmd: "ls", mode: "safe" },
      undefined,
      extensionContext,
    );
  });

  it("blocks tool execution when hook returns block=true", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue({
      block: true,
      blockReason: "blocked",
    });
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "exec", execute } as any);
    const extensionContext = {} as Parameters<typeof tool.execute>[3];

    await expect(
      tool.execute("call-3", { cmd: "rm -rf /" }, undefined, extensionContext),
    ).rejects.toThrow("blocked");
    expect(execute).not.toHaveBeenCalled();
  });

  it("continues execution when hook throws", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockRejectedValue(new Error("boom"));
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "read", execute } as any);
    const extensionContext = {} as Parameters<typeof tool.execute>[3];

    await tool.execute("call-4", { path: "/tmp/file" }, undefined, extensionContext);

    expect(execute).toHaveBeenCalledWith(
      "call-4",
      { path: "/tmp/file" },
      undefined,
      extensionContext,
    );
  });

  it("normalizes non-object params for hook contract", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "ReAd", execute } as any, {
      agentId: "main",
      sessionKey: "main",
      sessionId: "ephemeral-main",
      runId: "run-main",
    });
    const extensionContext = {} as Parameters<typeof tool.execute>[3];

    await tool.execute("call-5", "not-an-object", undefined, extensionContext);

    expect(hookRunner.runBeforeToolCall).toHaveBeenCalledWith(
      {
        toolName: "read",
        params: {},
        runId: "run-main",
        toolCallId: "call-5",
      },
      {
        toolName: "read",
        agentId: "main",
        sessionKey: "main",
        sessionId: "ephemeral-main",
        runId: "run-main",
        toolCallId: "call-5",
      },
    );
  });

  it("keeps adjusted params isolated per run when toolCallId collides", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall
      .mockResolvedValueOnce({ params: { marker: "A" } })
      .mockResolvedValueOnce({ params: { marker: "B" } });
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const toolA = wrapToolWithBeforeToolCallHook({ name: "Read", execute } as any, {
      runId: "run-a",
    });
    // oxlint-disable-next-line typescript/no-explicit-any
    const toolB = wrapToolWithBeforeToolCallHook({ name: "Read", execute } as any, {
      runId: "run-b",
    });
    const extensionContextA = {} as Parameters<typeof toolA.execute>[3];
    const extensionContextB = {} as Parameters<typeof toolB.execute>[3];
    const sharedToolCallId = "shared-call";

    await toolA.execute(sharedToolCallId, { path: "/tmp/a.txt" }, undefined, extensionContextA);
    await toolB.execute(sharedToolCallId, { path: "/tmp/b.txt" }, undefined, extensionContextB);

    expect(consumeAdjustedParamsForToolCall(sharedToolCallId, "run-a")).toEqual({
      path: "/tmp/a.txt",
      marker: "A",
    });
    expect(consumeAdjustedParamsForToolCall(sharedToolCallId, "run-b")).toEqual({
      path: "/tmp/b.txt",
      marker: "B",
    });
    expect(consumeAdjustedParamsForToolCall(sharedToolCallId, "run-a")).toBeUndefined();
  });

  it("blocks non-gog shell probes for google-workspace intent before plugin hooks", async () => {
    hookRunner.hasHooks.mockReturnValue(false);
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "exec", execute } as any, {
      routeIntent: { googleWorkspace: true },
    });
    const extensionContext = {} as Parameters<typeof tool.execute>[3];

    await expect(
      tool.execute("call-gog-probe", { command: "pwd && ls -la" }, undefined, extensionContext),
    ).rejects.toThrow("[route:exec_route_not_applicable]");
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows gog commands for google-workspace intent", async () => {
    hookRunner.hasHooks.mockReturnValue(false);
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "exec", execute } as any, {
      routeIntent: { googleWorkspace: true },
    });
    const extensionContext = {} as Parameters<typeof tool.execute>[3];

    await tool.execute(
      "call-gog-allow",
      { command: "gog gmail search newer_than:1d --max 5" },
      undefined,
      extensionContext,
    );

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("allows env-prefixed gog commands for google-workspace intent", async () => {
    hookRunner.hasHooks.mockReturnValue(false);
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "exec", execute } as any, {
      routeIntent: { googleWorkspace: true },
    });
    const extensionContext = {} as Parameters<typeof tool.execute>[3];

    await tool.execute(
      "call-gog-env",
      { command: "GOG_ACCOUNT=aaronpqking@gmail.com gog gmail search newer_than:1d --max 5" },
      undefined,
      extensionContext,
    );

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("remaps stale bundled gog skill paths before route intent is resolved", async () => {
    hookRunner.hasHooks.mockReturnValue(false);
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "read", execute } as any);
    const extensionContext = {} as Parameters<typeof tool.execute>[3];
    const skillsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-bundled-skills-"));
    const gogSkillPath = path.join(skillsRoot, "gog", "SKILL.md");
    const staleMissingPath = path.join(
      skillsRoot,
      "legacy-runtime",
      "node_modules",
      "openclaw",
      "skills",
      "gog",
      "SKILL.md",
    );
    fs.mkdirSync(path.dirname(gogSkillPath), { recursive: true });
    fs.writeFileSync(gogSkillPath, "# gog skill\n");
    const previousBundledSkillsDir = process.env.OPENCLAW_BUNDLED_SKILLS_DIR;
    process.env.OPENCLAW_BUNDLED_SKILLS_DIR = skillsRoot;

    try {
      await tool.execute(
        "call-gog-skill-remap",
        { path: staleMissingPath },
        undefined,
        extensionContext,
      );
      expect(execute).toHaveBeenCalledWith(
        "call-gog-skill-remap",
        { path: gogSkillPath },
        undefined,
        extensionContext,
      );
    } finally {
      if (previousBundledSkillsDir === undefined) {
        delete process.env.OPENCLAW_BUNDLED_SKILLS_DIR;
      } else {
        process.env.OPENCLAW_BUNDLED_SKILLS_DIR = previousBundledSkillsDir;
      }
      fs.rmSync(skillsRoot, { recursive: true, force: true });
    }
  });

  it("blocks non-gog exec probes (for example find scans) for google-workspace intent", async () => {
    hookRunner.hasHooks.mockReturnValue(false);
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "exec", execute } as any, {
      routeIntent: { googleWorkspace: true },
    });
    const extensionContext = {} as Parameters<typeof tool.execute>[3];

    await expect(
      tool.execute(
        "call-gog-find-probe",
        { command: "find /usr -path '*gog*SKILL.md' | head -20" },
        undefined,
        extensionContext,
      ),
    ).rejects.toThrow("[route:exec_route_not_applicable]");
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks browser attach for google-workspace intent when browser was not explicitly requested", async () => {
    hookRunner.hasHooks.mockReturnValue(false);
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const tool = wrapToolWithBeforeToolCallHook({ name: "browser", execute } as any, {
      routeIntent: { googleWorkspace: true, browserExplicitlyRequested: false },
    });
    const extensionContext = {} as Parameters<typeof tool.execute>[3];

    await expect(
      tool.execute("call-gog-browser", { action: "attach" }, undefined, extensionContext),
    ).rejects.toThrow("[route:browser_attach_not_required]");
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("before_tool_call hook deduplication (#15502)", () => {
  let hookRunner: HookRunnerMock;

  beforeEach(() => {
    resetDiagnosticSessionStateForTest();
    hookRunner = installMockHookRunner({
      hasHooksReturn: true,
      runBeforeToolCallImpl: async () => undefined,
    });
  });

  it("fires hook exactly once when tool goes through wrap + toToolDefinitions", async () => {
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const baseTool = { name: "web_fetch", execute, description: "fetch", parameters: {} } as any;

    const wrapped = wrapToolWithBeforeToolCallHook(baseTool, {
      agentId: "main",
      sessionKey: "main",
    });
    const [def] = toToolDefinitions([wrapped]);
    const extensionContext = {} as Parameters<typeof def.execute>[4];
    await def.execute(
      "call-dedup",
      { url: "https://example.com" },
      undefined,
      undefined,
      extensionContext,
    );

    expect(hookRunner.runBeforeToolCall).toHaveBeenCalledTimes(1);
  });

  it("fires hook exactly once when tool goes through wrap + abort + toToolDefinitions", async () => {
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    // oxlint-disable-next-line typescript/no-explicit-any
    const baseTool = { name: "Bash", execute, description: "bash", parameters: {} } as any;

    const abortController = new AbortController();
    const wrapped = wrapToolWithBeforeToolCallHook(baseTool, {
      agentId: "main",
      sessionKey: "main",
    });
    const withAbort = wrapToolWithAbortSignal(wrapped, abortController.signal);
    const [def] = toToolDefinitions([withAbort]);
    const extensionContext = {} as Parameters<typeof def.execute>[4];

    await def.execute(
      "call-abort-dedup",
      { command: "ls" },
      undefined,
      undefined,
      extensionContext,
    );

    expect(hookRunner.runBeforeToolCall).toHaveBeenCalledTimes(1);
  });
});

describe("before_tool_call hook integration for client tools", () => {
  let hookRunner: HookRunnerMock;

  beforeEach(() => {
    resetDiagnosticSessionStateForTest();
    hookRunner = installMockHookRunner();
  });

  it("passes modified params to client tool callbacks", async () => {
    hookRunner.hasHooks.mockReturnValue(true);
    hookRunner.runBeforeToolCall.mockResolvedValue({ params: { extra: true } });
    const onClientToolCall = vi.fn();
    const [tool] = toClientToolDefinitions(
      [
        {
          type: "function",
          function: {
            name: "client_tool",
            description: "Client tool",
            parameters: { type: "object", properties: { value: { type: "string" } } },
          },
        },
      ],
      onClientToolCall,
      { agentId: "main", sessionKey: "main" },
    );
    const extensionContext = {} as Parameters<typeof tool.execute>[4];
    await tool.execute("client-call-1", { value: "ok" }, undefined, undefined, extensionContext);

    expect(onClientToolCall).toHaveBeenCalledWith("client_tool", {
      value: "ok",
      extra: true,
    });
  });
});
