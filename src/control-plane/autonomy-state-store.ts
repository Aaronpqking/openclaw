import os from "node:os";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { readJsonFile, writeJsonAtomic } from "../infra/json-files.js";
import type { AutonomyState, AutonomyVerificationState } from "./autonomy-state.js";
import { createAutonomyState, recordAutonomyWriteback } from "./autonomy-state.js";
import type { TaskPacket } from "./task-packet.js";

type AutonomyStateStoreFile = {
  version: 2;
  states: Record<string, AutonomyState>;
  sessionIndex: Record<string, string>;
};

const AUTONOMY_STATE_RELATIVE_PATH = path.join("control-plane", "autonomy-state.json");

function resolveAutonomyStateFilePath(explicitStateDir?: string): string {
  const stateDir = explicitStateDir ?? resolveStateDir(process.env, os.homedir);
  return path.join(stateDir, AUTONOMY_STATE_RELATIVE_PATH);
}

function coerceStoreFile(value: unknown): AutonomyStateStoreFile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as { version?: unknown; states?: unknown; sessionIndex?: unknown };
  if (!record.states || typeof record.states !== "object") {
    return null;
  }
  if (record.version !== 1 && record.version !== 2) {
    return null;
  }
  return {
    version: 2,
    states: record.states as Record<string, AutonomyState>,
    sessionIndex:
      record.sessionIndex &&
      typeof record.sessionIndex === "object" &&
      !Array.isArray(record.sessionIndex)
        ? (record.sessionIndex as Record<string, string>)
        : {},
  };
}

async function loadAutonomyStateStore(explicitStateDir?: string): Promise<AutonomyStateStoreFile> {
  const filePath = resolveAutonomyStateFilePath(explicitStateDir);
  const loaded = coerceStoreFile(await readJsonFile<unknown>(filePath));
  if (loaded) {
    return loaded;
  }
  return { version: 2, states: {}, sessionIndex: {} };
}

async function saveAutonomyStateStore(
  store: AutonomyStateStoreFile,
  explicitStateDir?: string,
): Promise<void> {
  const filePath = resolveAutonomyStateFilePath(explicitStateDir);
  await writeJsonAtomic(filePath, store, { trailingNewline: true });
}

export function resolveAutonomyTaskPacketStateKey(taskPacket: TaskPacket): string {
  return taskPacket.requestId;
}

function resolveAuthorityLevel(taskPacket: TaskPacket): AutonomyState["authorityLevel"] {
  return taskPacket.initiationSource === "operator_requested" ? "T2" : "T1";
}

function buildAutonomyStateFromTaskPacket(params: {
  taskPacket: TaskPacket;
  runId?: string;
}): AutonomyState {
  const { taskPacket } = params;
  return createAutonomyState({
    project: taskPacket.project,
    build: taskPacket.build,
    phase: taskPacket.phase,
    objective: taskPacket.objective,
    blockers: taskPacket.constraints ?? [],
    nextActions: taskPacket.acceptance ?? [],
    verificationState: "not_started",
    authorityLevel: resolveAuthorityLevel(taskPacket),
    allowedActionScopes: taskPacket.allowedActionScopes,
    allowedActions: taskPacket.allowedActions,
    autonomyMode: taskPacket.autonomyMode,
    initiationSource: taskPacket.initiationSource,
    reportTargets: taskPacket.reportTargets,
    lastRunId: params.runId ?? taskPacket.runId,
    lastTaskPacketRef: taskPacket.requestId,
    lastEvidenceRefs: taskPacket.evidenceRefs,
  });
}

export async function updateAutonomyStateFromTaskPacket(params: {
  taskPacket: TaskPacket;
  sessionKey?: string;
  runId?: string;
  verificationState?: AutonomyVerificationState;
  lastResult?: string;
  explicitStateDir?: string;
}): Promise<AutonomyState> {
  const key = resolveAutonomyTaskPacketStateKey(params.taskPacket);
  const store = await loadAutonomyStateStore(params.explicitStateDir);
  const current =
    store.states[key] ??
    buildAutonomyStateFromTaskPacket({ taskPacket: params.taskPacket, runId: params.runId });
  const next = recordAutonomyWriteback(current, {
    phase: params.taskPacket.phase,
    blockers: params.taskPacket.constraints ?? current.blockers,
    nextActions: params.taskPacket.acceptance ?? current.nextActions,
    allowedActionScopes: params.taskPacket.allowedActionScopes ?? current.allowedActionScopes,
    allowedActions: params.taskPacket.allowedActions ?? current.allowedActions,
    autonomyMode: params.taskPacket.autonomyMode ?? current.autonomyMode,
    initiationSource: params.taskPacket.initiationSource ?? current.initiationSource,
    reportTargets: params.taskPacket.reportTargets ?? current.reportTargets,
    lastRunId: params.runId ?? params.taskPacket.runId ?? current.lastRunId,
    lastTaskPacketRef: params.taskPacket.requestId,
    lastEvidenceRefs: params.taskPacket.evidenceRefs ?? current.lastEvidenceRefs,
    verificationState: params.verificationState ?? current.verificationState,
    lastResult: params.lastResult ?? current.lastResult,
  });
  store.states[key] = next;
  if (params.sessionKey) {
    store.sessionIndex[params.sessionKey] = key;
  }
  await saveAutonomyStateStore(store, params.explicitStateDir);
  return next;
}

export async function getAutonomyStateForSession(params: {
  sessionKey: string;
  explicitStateDir?: string;
}): Promise<AutonomyState | null> {
  const store = await loadAutonomyStateStore(params.explicitStateDir);
  const key = store.sessionIndex[params.sessionKey];
  if (!key) {
    return null;
  }
  return store.states[key] ?? null;
}
