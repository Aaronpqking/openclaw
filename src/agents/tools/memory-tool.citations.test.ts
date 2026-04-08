import { beforeEach, describe, expect, it } from "vitest";
import {
  getMemorySearchManagerMockCalls,
  getReadAgentMemoryFileMockCalls,
  resetMemoryToolMockState,
  setMemoryBackend,
  setMemoryReadFileImpl,
  setMemorySearchImpl,
  type MemoryReadParams,
} from "../../../test/helpers/memory-tool-manager-mock.js";
import {
  asOpenClawConfig,
  createAutoCitationsMemorySearchTool,
  createDefaultMemoryToolConfig,
  createMemoryGetToolOrThrow,
  createMemorySearchToolOrThrow,
  expectUnavailableMemorySearchDetails,
} from "./memory-tool.test-helpers.js";

beforeEach(() => {
  resetMemoryToolMockState({
    backend: "builtin",
    searchImpl: async () => [
      {
        path: "MEMORY.md",
        startLine: 5,
        endLine: 7,
        score: 0.9,
        snippet: "@@ -5,3 @@\nAssistant: noted",
        source: "memory" as const,
      },
    ],
    readFileImpl: async (params: MemoryReadParams) => ({ text: "", path: params.relPath }),
  });
});

describe("memory search citations", () => {
  it("appends source information when citations are enabled", async () => {
    setMemoryBackend("builtin");
    const cfg = asOpenClawConfig({
      memory: { citations: "on" },
      agents: { list: [{ id: "main", default: true }] },
    });
    const tool = createMemorySearchToolOrThrow({ config: cfg });
    const result = await tool.execute("call_citations_on", { query: "notes" });
    const details = result.details as { results: Array<{ snippet: string; citation?: string }> };
    expect(details.results[0]?.snippet).toMatch(/Source: MEMORY.md#L5-L7/);
    expect(details.results[0]?.citation).toBe("MEMORY.md#L5-L7");
  });

  it("leaves snippet untouched when citations are off", async () => {
    setMemoryBackend("builtin");
    const cfg = asOpenClawConfig({
      memory: { citations: "off" },
      agents: { list: [{ id: "main", default: true }] },
    });
    const tool = createMemorySearchToolOrThrow({ config: cfg });
    const result = await tool.execute("call_citations_off", { query: "notes" });
    const details = result.details as { results: Array<{ snippet: string; citation?: string }> };
    expect(details.results[0]?.snippet).not.toMatch(/Source:/);
    expect(details.results[0]?.citation).toBeUndefined();
  });

  it("clamps decorated snippets to qmd injected budget", async () => {
    setMemoryBackend("qmd");
    const cfg = asOpenClawConfig({
      memory: { citations: "on", backend: "qmd", qmd: { limits: { maxInjectedChars: 20 } } },
      agents: { list: [{ id: "main", default: true }] },
    });
    const tool = createMemorySearchToolOrThrow({ config: cfg });
    const result = await tool.execute("call_citations_qmd", { query: "notes" });
    const details = result.details as { results: Array<{ snippet: string; citation?: string }> };
    expect(details.results[0]?.snippet.length).toBeLessThanOrEqual(20);
  });

  it("honors auto mode for direct chats", async () => {
    setMemoryBackend("builtin");
    const tool = createAutoCitationsMemorySearchTool("agent:main:discord:dm:u123");
    const result = await tool.execute("auto_mode_direct", { query: "notes" });
    const details = result.details as { results: Array<{ snippet: string }> };
    expect(details.results[0]?.snippet).toMatch(/Source:/);
  });

  it("suppresses citations for auto mode in group chats", async () => {
    setMemoryBackend("builtin");
    const tool = createAutoCitationsMemorySearchTool("agent:main:discord:group:c123");
    const result = await tool.execute("auto_mode_group", { query: "notes" });
    const details = result.details as { results: Array<{ snippet: string }> };
    expect(details.results[0]?.snippet).not.toMatch(/Source:/);
  });

  it("reranks same-day token queries toward the token-bearing snippet", async () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    setMemorySearchImpl(async () => [
      {
        path: `memory/${todayIso}.md`,
        startLine: 1,
        endLine: 3,
        score: 0.93,
        snippet: "## Validation\n- recovery-memory-validation-20260408T022016Z",
        source: "memory" as const,
      },
      {
        path: `memory/${todayIso}.md`,
        startLine: 7,
        endLine: 10,
        score: 0.91,
        snippet:
          "## Memory proof\n- token: MEMPROOF-2026-04-08-0406Z\n- phrase: copper-badger-skyline",
        source: "memory" as const,
      },
    ]);
    const tool = createMemorySearchToolOrThrow();

    const result = await tool.execute("call_same_day_token", {
      query: "What is the memory proof token saved today?",
    });
    const details = result.details as { results: Array<{ snippet: string }> };

    expect(details.results[0]?.snippet).toContain("token: MEMPROOF-2026-04-08-0406Z");
  });
});

describe("memory tools", () => {
  it("does not throw when memory_search fails (e.g. embeddings 429)", async () => {
    setMemorySearchImpl(async () => {
      throw new Error("openai embeddings failed: 429 insufficient_quota");
    });

    const cfg = createDefaultMemoryToolConfig();
    const tool = createMemorySearchToolOrThrow({ config: cfg });

    const result = await tool.execute("call_1", { query: "hello" });
    expectUnavailableMemorySearchDetails(result.details, {
      error: "openai embeddings failed: 429 insufficient_quota",
      warning: "Memory search is unavailable because the embedding provider quota is exhausted.",
      action: "Top up or switch embedding provider, then retry memory_search.",
    });
  });

  it("does not throw when memory_get fails", async () => {
    setMemoryReadFileImpl(async (_params: MemoryReadParams) => {
      throw new Error("path required");
    });

    const tool = createMemoryGetToolOrThrow();

    const result = await tool.execute("call_2", { path: "memory/NOPE.md" });
    expect(result.details).toEqual({
      path: "memory/NOPE.md",
      text: "",
      disabled: true,
      error: "path required",
    });
  });

  it("returns empty text without error when file does not exist (ENOENT)", async () => {
    setMemoryReadFileImpl(async (_params: MemoryReadParams) => {
      return { text: "", path: "memory/2026-02-19.md" };
    });

    const tool = createMemoryGetToolOrThrow();

    const result = await tool.execute("call_enoent", { path: "memory/2026-02-19.md" });
    expect(result.details).toEqual({
      text: "",
      path: "memory/2026-02-19.md",
    });
  });

  it("uses the builtin direct memory file path for memory_get", async () => {
    setMemoryBackend("builtin");
    const tool = createMemoryGetToolOrThrow();

    const result = await tool.execute("call_builtin_fast_path", { path: "memory/2026-02-19.md" });

    expect(result.details).toEqual({
      text: "",
      path: "memory/2026-02-19.md",
    });
    expect(getReadAgentMemoryFileMockCalls()).toBe(1);
    expect(getMemorySearchManagerMockCalls()).toBe(0);
  });
});
