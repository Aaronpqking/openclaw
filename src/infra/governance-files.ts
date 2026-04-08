import path from "node:path";

export const GOVERNANCE_FILE_NAMES = [
  "SOUL.md",
  "USER.md",
  "OPERATIONS.md",
  "APPROVALS.md",
  "CHANNELS.md",
  "MEMORY.md",
  "PROJECTS.md",
] as const;

const GOVERNANCE_FILE_NAME_SET = new Set<string>(GOVERNANCE_FILE_NAMES);

export class GovernanceProtectionError extends Error {
  code = "governance-protected" as const;
  target: string;

  constructor(target: string, operation: string) {
    super(
      `Governance file "${target}" is protected from ${operation}; use an explicit operator-approved amendment path.`,
    );
    this.name = "GovernanceProtectionError";
    this.target = target;
  }
}

function normalizeRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments.join("/");
}

export function isGovernanceRelativePath(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) {
    return false;
  }
  const segments = normalized.split("/");
  return segments.length === 1 && GOVERNANCE_FILE_NAME_SET.has(segments[0] ?? "");
}

export function isGovernancePathWithinRoot(params: { rootDir: string; filePath: string }): boolean {
  const rootResolved = path.resolve(params.rootDir);
  const candidateResolved = path.resolve(params.filePath);
  const relative = path.relative(rootResolved, candidateResolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return false;
  }
  return isGovernanceRelativePath(relative);
}

export function assertGovernanceMutationAllowed(params: {
  rootDir: string;
  operation: string;
  relativePath?: string;
  filePath?: string;
}): void {
  const target =
    typeof params.relativePath === "string"
      ? normalizeRelativePath(params.relativePath)
      : typeof params.filePath === "string"
        ? path.relative(path.resolve(params.rootDir), path.resolve(params.filePath))
        : "";
  const protectedPath =
    typeof params.relativePath === "string"
      ? isGovernanceRelativePath(params.relativePath)
      : typeof params.filePath === "string"
        ? isGovernancePathWithinRoot({ rootDir: params.rootDir, filePath: params.filePath })
        : false;
  if (protectedPath) {
    throw new GovernanceProtectionError(target || "<unknown>", params.operation);
  }
}
