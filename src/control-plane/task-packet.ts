const TASK_PACKET_SCOPES = ["global", "project"] as const;
const TASK_PACKET_PROJECTS = ["none", "openclaw", "eleanor", "shared"] as const;
const TASK_PACKET_BUILDS = [
  "engine",
  "api",
  "ui",
  "infra",
  "memory",
  "autonomy",
  "execution",
  "policy",
  "trust",
  "channels",
  "release",
  "docs",
  "tests",
] as const;
const TASK_PACKET_PHASES = [
  "discover",
  "diagnose",
  "design",
  "plan",
  "implement",
  "repair",
  "verify",
  "report",
  "blocked",
  "awaiting_decision",
  "deferred",
  "handoff",
  "complete",
] as const;
const TASK_PACKET_REPLY_MODES = ["summary", "detailed", "checkpoint", "enum_only"] as const;
const TASK_PACKET_AUTONOMY_MODES = [
  "observe",
  "propose",
  "execute_safe",
  "execute_bounded",
  "escalate",
] as const;
const TASK_PACKET_INITIATION_SOURCES = [
  "operator_requested",
  "self_driven",
  "scheduled",
  "external_triggered",
] as const;
const TASK_PACKET_ACTION_SCOPES = [
  "global",
  "cursor_workspace",
  "operator_thread",
  "external_runtime",
  "tenant_surface",
] as const;
const TASK_PACKET_REPORT_CHANNELS = ["whatsapp", "operator_thread", "webchat", "email"] as const;

export type TaskPacketScope = (typeof TASK_PACKET_SCOPES)[number];
export type TaskPacketProject = (typeof TASK_PACKET_PROJECTS)[number];
export type TaskPacketBuild = (typeof TASK_PACKET_BUILDS)[number];
export type TaskPacketPhase = (typeof TASK_PACKET_PHASES)[number];
export type TaskPacketReplyMode = (typeof TASK_PACKET_REPLY_MODES)[number];
export type TaskPacketAutonomyMode = (typeof TASK_PACKET_AUTONOMY_MODES)[number];
export type TaskPacketInitiationSource = (typeof TASK_PACKET_INITIATION_SOURCES)[number];
export type TaskPacketActionScope = (typeof TASK_PACKET_ACTION_SCOPES)[number];
export type TaskPacketReportChannel = (typeof TASK_PACKET_REPORT_CHANNELS)[number];

export type TaskPacketReportTarget = {
  channel: TaskPacketReportChannel;
  target: string;
  immediate?: boolean;
};

export type TaskPacket = {
  requestId: string;
  runId?: string;
  scope: TaskPacketScope;
  project: TaskPacketProject;
  build: TaskPacketBuild;
  phase: TaskPacketPhase;
  objective: string;
  allowedActionScopes: TaskPacketActionScope[];
  replyMode: TaskPacketReplyMode;
  constraints?: string[];
  acceptance?: string[];
  allowedActions?: string[];
  autonomyMode?: TaskPacketAutonomyMode;
  initiationSource?: TaskPacketInitiationSource;
  evidenceRefs?: string[];
  reportTargets?: TaskPacketReportTarget[];
};

export const taskPacketEnums = {
  scopes: TASK_PACKET_SCOPES,
  projects: TASK_PACKET_PROJECTS,
  builds: TASK_PACKET_BUILDS,
  phases: TASK_PACKET_PHASES,
  replyModes: TASK_PACKET_REPLY_MODES,
  autonomyModes: TASK_PACKET_AUTONOMY_MODES,
  initiationSources: TASK_PACKET_INITIATION_SOURCES,
  actionScopes: TASK_PACKET_ACTION_SCOPES,
  reportChannels: TASK_PACKET_REPORT_CHANNELS,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`taskPacket.${field} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeEnumValue<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  field: string,
): TValue {
  const normalized = normalizeNonEmptyString(value, field);
  if (!allowed.includes(normalized as TValue)) {
    throw new Error(`taskPacket.${field} must be one of: ${allowed.join(", ")}`);
  }
  return normalized as TValue;
}

function normalizeStringList(value: unknown, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`taskPacket.${field} must be an array of strings`);
  }
  const normalized = value
    .map((entry) => normalizeNonEmptyString(entry, `${field}[]`))
    .filter((entry, index, list) => list.indexOf(entry) === index);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeActionScopes(value: unknown): TaskPacketActionScope[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("taskPacket.allowedActionScopes must contain at least one scope");
  }
  const normalized = value
    .map((entry) => normalizeEnumValue(entry, TASK_PACKET_ACTION_SCOPES, "allowedActionScopes[]"))
    .filter((entry, index, list) => list.indexOf(entry) === index);
  if (normalized.length === 0) {
    throw new Error("taskPacket.allowedActionScopes must contain at least one scope");
  }
  return normalized;
}

function normalizeReportTargets(value: unknown): TaskPacketReportTarget[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("taskPacket.reportTargets must be an array");
  }
  const normalized = value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`taskPacket.reportTargets[${String(index)}] must be an object`);
    }
    const channel = normalizeEnumValue(
      entry.channel,
      TASK_PACKET_REPORT_CHANNELS,
      `reportTargets[${String(index)}].channel`,
    );
    const target = normalizeNonEmptyString(entry.target, `reportTargets[${String(index)}].target`);
    const immediate =
      typeof entry.immediate === "boolean" ? entry.immediate : entry.immediate === undefined;
    return { channel, target, immediate };
  });
  return normalized.length > 0 ? normalized : undefined;
}

export function parseTaskPacket(value: unknown): TaskPacket {
  if (!isRecord(value)) {
    throw new Error("taskPacket must be an object");
  }
  return {
    requestId: normalizeNonEmptyString(value.requestId, "requestId"),
    runId: value.runId === undefined ? undefined : normalizeNonEmptyString(value.runId, "runId"),
    scope: normalizeEnumValue(value.scope, TASK_PACKET_SCOPES, "scope"),
    project: normalizeEnumValue(value.project, TASK_PACKET_PROJECTS, "project"),
    build: normalizeEnumValue(value.build, TASK_PACKET_BUILDS, "build"),
    phase: normalizeEnumValue(value.phase, TASK_PACKET_PHASES, "phase"),
    objective: normalizeNonEmptyString(value.objective, "objective"),
    allowedActionScopes: normalizeActionScopes(value.allowedActionScopes),
    replyMode: normalizeEnumValue(value.replyMode, TASK_PACKET_REPLY_MODES, "replyMode"),
    constraints: normalizeStringList(value.constraints, "constraints"),
    acceptance: normalizeStringList(value.acceptance, "acceptance"),
    allowedActions: normalizeStringList(value.allowedActions, "allowedActions"),
    autonomyMode:
      value.autonomyMode === undefined
        ? undefined
        : normalizeEnumValue(value.autonomyMode, TASK_PACKET_AUTONOMY_MODES, "autonomyMode"),
    initiationSource:
      value.initiationSource === undefined
        ? undefined
        : normalizeEnumValue(
            value.initiationSource,
            TASK_PACKET_INITIATION_SOURCES,
            "initiationSource",
          ),
    evidenceRefs: normalizeStringList(value.evidenceRefs, "evidenceRefs"),
    reportTargets: normalizeReportTargets(value.reportTargets),
  };
}
