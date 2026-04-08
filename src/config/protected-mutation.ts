import fs from "node:fs";
import path from "node:path";
import { resolveControlUiRootOverrideSync } from "../infra/control-ui-assets.js";
import type { OpenClawConfig } from "./types.js";

export type ProtectedConfigMutationContext = {
  source?: string;
  actor?: string | null;
  approved?: boolean;
  approvalContext?: string | null;
  requestId?: string | null;
};

export type ProtectedConfigClass =
  | "control-ui-assets"
  | "gateway-auth"
  | "gateway-network"
  | "routing-defaults"
  | "session-defaults"
  | "channel-credentials"
  | "connector-auth"
  | "secret-provider";

export type ProtectedConfigChange = {
  path: string;
  class: ProtectedConfigClass;
  previousValue: unknown;
  nextValue: unknown;
};

export type ProtectedConfigValidationIssue = {
  path: string;
  code: "missing" | "unreadable" | "invalid-structure" | "disallowed-prefix";
  message: string;
};

export type ProtectedConfigMutationDecision = {
  source: string;
  actor: string | null;
  requestId: string | null;
  approvalContext: string | null;
  approved: boolean;
  productionMode: boolean;
  allowed: boolean;
  reason: string;
  changes: ProtectedConfigChange[];
  validationIssues: ProtectedConfigValidationIssue[];
};

const PROTECTED_PATH_RULES: Array<{ path: string; class: ProtectedConfigClass }> = [
  { path: "gateway.controlUi.root", class: "control-ui-assets" },
  { path: "gateway.auth", class: "gateway-auth" },
  { path: "gateway.mode", class: "gateway-network" },
  { path: "gateway.bind", class: "gateway-network" },
  { path: "gateway.customBindHost", class: "gateway-network" },
  { path: "gateway.remote", class: "gateway-network" },
  { path: "gateway.trustedProxies", class: "gateway-network" },
  { path: "routing", class: "routing-defaults" },
  { path: "sessions", class: "session-defaults" },
  { path: "channels", class: "channel-credentials" },
  { path: "hooks.gmail", class: "connector-auth" },
  { path: "hooks.token", class: "connector-auth" },
  { path: "secrets.providers", class: "secret-provider" },
];

const APPROVAL_REQUIRED_SOURCES = new Set([
  "cli.config.set",
  "cli.config.unset",
  "gateway.config.set",
  "gateway.config.patch",
  "gateway.config.apply",
  "agent.config.set",
]);

const ENFORCED_APPROVAL_CLASSES = new Set<ProtectedConfigClass>([
  "control-ui-assets",
  "gateway-auth",
  "gateway-network",
  "connector-auth",
  "secret-provider",
]);

function normalizePath(raw: string): string {
  return raw
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\./, "")
    .replace(/\.+/g, ".");
}

function pathIntersects(leftRaw: string, rightRaw: string): boolean {
  const left = normalizePath(leftRaw);
  const right = normalizePath(rightRaw);
  return (
    left === right ||
    left.startsWith(`${right}.`) ||
    right.startsWith(`${left}.`) ||
    left === "" ||
    right === ""
  );
}

function isPathUnderPrefix(candidateRaw: string, prefixRaw: string): boolean {
  const candidate = normalizePath(candidateRaw);
  const prefix = normalizePath(prefixRaw);
  return candidate === prefix || candidate.startsWith(`${prefix}.`);
}

function splitPath(pathStr: string): string[] {
  const normalized = normalizePath(pathStr);
  if (!normalized) {
    return [];
  }
  return normalized.split(".").filter(Boolean);
}

function getValueAtPath(root: unknown, pathStr: string): unknown {
  const segments = splitPath(pathStr);
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (!Number.isFinite(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    const record = current as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, segment)) {
      return undefined;
    }
    current = record[segment];
  }
  return current;
}

function isTruthyEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isFalsyEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off"
  );
}

export function isProtectedMutationProductionMode(env: NodeJS.ProcessEnv): boolean {
  if (isTruthyEnv(env.OPENCLAW_PROTECTED_CONFIG_ENFORCE)) {
    return true;
  }
  if (isFalsyEnv(env.OPENCLAW_PROTECTED_CONFIG_ENFORCE)) {
    return false;
  }
  const openclawEnv = env.OPENCLAW_ENV?.trim().toLowerCase();
  if (openclawEnv === "prod" || openclawEnv === "production") {
    return true;
  }
  return env.NODE_ENV?.trim().toLowerCase() === "production";
}

function resolveAllowedPrefixes(env: NodeJS.ProcessEnv): string[] {
  const raw = env.OPENCLAW_CONTROL_UI_ROOT_ALLOWED_PREFIXES?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

function buildControlUiRootValidationIssue(
  value: unknown,
  env: NodeJS.ProcessEnv,
): ProtectedConfigValidationIssue | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      path: "gateway.controlUi.root",
      code: "invalid-structure",
      message: "gateway.controlUi.root must be a non-empty string path when set.",
    };
  }
  const raw = value.trim();
  const resolvedRoot = resolveControlUiRootOverrideSync(raw);
  if (!resolvedRoot) {
    return {
      path: "gateway.controlUi.root",
      code: "missing",
      message:
        `gateway.controlUi.root candidate "${raw}" does not exist or is missing index.html. ` +
        "Build Control UI assets (`pnpm ui:build`) or set a valid root.",
    };
  }
  const resolvedIndex = path.join(resolvedRoot, "index.html");
  const resolvedAssets = path.join(resolvedRoot, "assets");
  try {
    fs.accessSync(resolvedRoot, fs.constants.R_OK);
    fs.accessSync(resolvedIndex, fs.constants.R_OK);
  } catch {
    return {
      path: "gateway.controlUi.root",
      code: "unreadable",
      message: `gateway.controlUi.root candidate "${resolvedRoot}" is not readable by this process.`,
    };
  }
  try {
    const assetsStat = fs.statSync(resolvedAssets);
    if (!assetsStat.isDirectory()) {
      return {
        path: "gateway.controlUi.root",
        code: "invalid-structure",
        message: `gateway.controlUi.root candidate "${resolvedRoot}" is invalid: expected assets/ directory.`,
      };
    }
  } catch {
    return {
      path: "gateway.controlUi.root",
      code: "invalid-structure",
      message: `gateway.controlUi.root candidate "${resolvedRoot}" is invalid: missing assets/ directory.`,
    };
  }
  const allowedPrefixes = resolveAllowedPrefixes(env);
  if (allowedPrefixes.length > 0) {
    const withinAllowedPrefix = allowedPrefixes.some((prefix) => {
      const normalizedPrefix = prefix.endsWith(path.sep) ? prefix : `${prefix}${path.sep}`;
      return resolvedRoot === prefix || resolvedRoot.startsWith(normalizedPrefix);
    });
    if (!withinAllowedPrefix) {
      return {
        path: "gateway.controlUi.root",
        code: "disallowed-prefix",
        message:
          `gateway.controlUi.root candidate "${resolvedRoot}" is outside ` +
          "OPENCLAW_CONTROL_UI_ROOT_ALLOWED_PREFIXES.",
      };
    }
  }
  return null;
}

function collectProtectedChanges(params: {
  previousConfig: OpenClawConfig;
  nextConfig: OpenClawConfig;
  changedPaths: Set<string>;
}): ProtectedConfigChange[] {
  const matched = new Map<string, ProtectedConfigClass>();
  for (const changedPath of params.changedPaths) {
    for (const rule of PROTECTED_PATH_RULES) {
      if (pathIntersects(changedPath, rule.path)) {
        matched.set(rule.path, rule.class);
      }
    }
  }
  const changes: ProtectedConfigChange[] = [];
  for (const [protectedPath, protectedClass] of matched.entries()) {
    changes.push({
      path: protectedPath,
      class: protectedClass,
      previousValue: getValueAtPath(params.previousConfig, protectedPath),
      nextValue: getValueAtPath(params.nextConfig, protectedPath),
    });
  }
  return changes;
}

export function summarizeProtectedValueForAudit(pathStr: string, value: unknown): unknown {
  if (value === undefined) {
    return "<unset>";
  }
  if (value === null) {
    return null;
  }
  const normalizedPath = normalizePath(pathStr).toLowerCase();
  const sensitivePath =
    normalizedPath.includes("token") ||
    normalizedPath.includes("password") ||
    normalizedPath.includes("secret") ||
    normalizedPath.includes("apikey") ||
    normalizedPath.includes("keyref") ||
    normalizedPath.includes("credential");
  if (sensitivePath) {
    return "<redacted>";
  }
  if (typeof value === "string") {
    return value.length > 220 ? `${value.slice(0, 220)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }
  if (typeof value === "object") {
    return "[object]";
  }
  if (typeof value === "symbol" || typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "function") {
    return "[function]";
  }
  return "<unknown>";
}

export function evaluateProtectedConfigMutation(params: {
  previousConfig: OpenClawConfig;
  nextConfig: OpenClawConfig;
  changedPaths: Set<string>;
  env: NodeJS.ProcessEnv;
  context?: ProtectedConfigMutationContext;
}): ProtectedConfigMutationDecision | null {
  const changes = collectProtectedChanges(params);
  if (changes.length === 0) {
    return null;
  }
  const source = params.context?.source?.trim() || "unknown";
  const actor = params.context?.actor?.trim() || null;
  const requestId = params.context?.requestId?.trim() || null;
  const approvalContext = params.context?.approvalContext?.trim() || null;
  const approved = params.context?.approved === true;
  const productionMode = isProtectedMutationProductionMode(params.env);

  const validationIssues: ProtectedConfigValidationIssue[] = [];
  for (const change of changes) {
    if (change.path === "gateway.controlUi.root") {
      const issue = buildControlUiRootValidationIssue(change.nextValue, params.env);
      if (issue) {
        validationIssues.push(issue);
      }
    }
  }
  if (validationIssues.length > 0) {
    return {
      source,
      actor,
      requestId,
      approvalContext,
      approved,
      productionMode,
      allowed: false,
      reason: validationIssues[0]?.message ?? "protected config validation failed",
      changes,
      validationIssues,
    };
  }

  const sourceRequiresApproval = productionMode && APPROVAL_REQUIRED_SOURCES.has(source);
  const hasEnforcedChange = changes.some((change) => ENFORCED_APPROVAL_CLASSES.has(change.class));

  if (productionMode && hasEnforcedChange && source === "unknown") {
    return {
      source,
      actor,
      requestId,
      approvalContext,
      approved,
      productionMode,
      allowed: false,
      reason:
        "Protected config mutation denied in production mode: missing source context. " +
        "Use an approved deploy/operator config apply path.",
      changes,
      validationIssues: [],
    };
  }

  if (sourceRequiresApproval && hasEnforcedChange && !approved) {
    return {
      source,
      actor,
      requestId,
      approvalContext,
      approved,
      productionMode,
      allowed: false,
      reason:
        `Protected config mutation denied for source "${source}" in production mode. ` +
        "Use an approved admin apply path.",
      changes,
      validationIssues: [],
    };
  }

  return {
    source,
    actor,
    requestId,
    approvalContext,
    approved,
    productionMode,
    allowed: true,
    reason:
      sourceRequiresApproval && hasEnforcedChange
        ? `protected mutation approved for source "${source}"`
        : productionMode
          ? `protected mutation allowed for source "${source}"`
          : "protected mutation allowed outside production mode",
    changes,
    validationIssues: [],
  };
}

export function getProtectedPathClass(pathStr: string): ProtectedConfigClass | null {
  for (const rule of PROTECTED_PATH_RULES) {
    if (isPathUnderPrefix(pathStr, rule.path)) {
      return rule.class;
    }
  }
  return null;
}
