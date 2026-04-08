import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type CapturedWriteOperations = {
  writeFile: (absolutePath: string, content: string) => Promise<void>;
};

type CapturedEditOperations = {
  writeFile: (absolutePath: string, content: string) => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  writeOperations: undefined as CapturedWriteOperations | undefined,
  editOperations: undefined as CapturedEditOperations | undefined,
}));

vi.mock("@mariozechner/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mariozechner/pi-coding-agent")>();
  return {
    ...actual,
    createWriteTool: (_cwd: string, options?: { operations?: CapturedWriteOperations }) => {
      mocks.writeOperations = options?.operations;
      return {
        name: "write",
        description: "test write tool",
        parameters: { type: "object", properties: {} },
        execute: async () => ({
          content: [{ type: "text" as const, text: "ok" }],
        }),
      };
    },
    createEditTool: (_cwd: string, options?: { operations?: CapturedEditOperations }) => {
      mocks.editOperations = options?.operations;
      return {
        name: "edit",
        description: "test edit tool",
        parameters: { type: "object", properties: {} },
        execute: async () => ({
          content: [{ type: "text" as const, text: "ok" }],
        }),
      };
    },
  };
});

const { createHostWorkspaceWriteTool, createHostWorkspaceEditTool } =
  await import("./pi-tools.read.js");

describe("governance protection in host fs tool operations", () => {
  let tmpDir = "";

  afterEach(async () => {
    mocks.writeOperations = undefined;
    mocks.editOperations = undefined;
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  it("blocks host write operations from overwriting workspace governance docs", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-governance-write-"));
    const targetPath = path.join(tmpDir, "SOUL.md");
    await fs.writeFile(targetPath, "original", "utf8");

    createHostWorkspaceWriteTool(tmpDir, { workspaceOnly: false });
    expect(mocks.writeOperations).toBeDefined();

    await expect(mocks.writeOperations!.writeFile(targetPath, "mutated")).rejects.toThrow(
      /operator-approved amendment path/i,
    );
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("original");
  });

  it("blocks host edit operations from overwriting workspace governance docs", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-governance-edit-"));
    const targetPath = path.join(tmpDir, "CHANNELS.md");
    await fs.writeFile(targetPath, "original", "utf8");

    createHostWorkspaceEditTool(tmpDir, { workspaceOnly: false });
    expect(mocks.editOperations).toBeDefined();

    await expect(mocks.editOperations!.writeFile(targetPath, "mutated")).rejects.toThrow(
      /operator-approved amendment path/i,
    );
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("original");
  });
});
