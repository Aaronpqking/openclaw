import type {
  TaskPacketActionScope,
  TaskPacketAutonomyMode,
  TaskPacketBuild,
  TaskPacketInitiationSource,
  TaskPacketPhase,
  TaskPacketProject,
  TaskPacketReportTarget,
} from "./task-packet.js";

export const AUTONOMY_VERIFICATION_STATES = [
  "not_started",
  "partial",
  "passed_scoped",
  "passed_live",
  "failed",
  "blocked",
] as const;
export const AUTONOMY_AUTHORITY_LEVELS = ["T0", "T1", "T2", "T3"] as const;

export type AutonomyVerificationState = (typeof AUTONOMY_VERIFICATION_STATES)[number];
export type AutonomyAuthorityLevel = (typeof AUTONOMY_AUTHORITY_LEVELS)[number];

export type AutonomyState = {
  project: TaskPacketProject;
  build: TaskPacketBuild;
  phase: TaskPacketPhase;
  objective: string;
  blockers: string[];
  nextActions: string[];
  verificationState: AutonomyVerificationState;
  authorityLevel: AutonomyAuthorityLevel;
  updatedAt: string;
  allowedActionScopes?: TaskPacketActionScope[];
  allowedActions?: string[];
  autonomyMode?: TaskPacketAutonomyMode;
  initiationSource?: TaskPacketInitiationSource;
  reportTargets?: TaskPacketReportTarget[];
  lastRunId?: string;
  lastTaskPacketRef?: string;
  lastEvidenceRefs?: string[];
  lastResult?: string;
};

export function createAutonomyState(
  input: Omit<AutonomyState, "updatedAt"> & { updatedAt?: string },
): AutonomyState {
  return {
    ...input,
    blockers: [...new Set(input.blockers)],
    nextActions: [...new Set(input.nextActions)],
    allowedActionScopes: input.allowedActionScopes
      ? [...new Set(input.allowedActionScopes)]
      : undefined,
    allowedActions: input.allowedActions ? [...new Set(input.allowedActions)] : undefined,
    reportTargets: input.reportTargets ? [...input.reportTargets] : undefined,
    lastEvidenceRefs: input.lastEvidenceRefs ? [...new Set(input.lastEvidenceRefs)] : undefined,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function recordAutonomyWriteback(
  state: AutonomyState,
  patch: {
    phase?: TaskPacketPhase;
    blockers?: string[];
    nextActions?: string[];
    verificationState?: AutonomyVerificationState;
    authorityLevel?: AutonomyAuthorityLevel;
    allowedActionScopes?: TaskPacketActionScope[];
    allowedActions?: string[];
    autonomyMode?: TaskPacketAutonomyMode;
    initiationSource?: TaskPacketInitiationSource;
    reportTargets?: TaskPacketReportTarget[];
    lastRunId?: string;
    lastTaskPacketRef?: string;
    lastEvidenceRefs?: string[];
    lastResult?: string;
    updatedAt?: string;
  },
): AutonomyState {
  return createAutonomyState({
    ...state,
    phase: patch.phase ?? state.phase,
    blockers: patch.blockers ?? state.blockers,
    nextActions: patch.nextActions ?? state.nextActions,
    verificationState: patch.verificationState ?? state.verificationState,
    authorityLevel: patch.authorityLevel ?? state.authorityLevel,
    allowedActionScopes: patch.allowedActionScopes ?? state.allowedActionScopes,
    allowedActions: patch.allowedActions ?? state.allowedActions,
    autonomyMode: patch.autonomyMode ?? state.autonomyMode,
    initiationSource: patch.initiationSource ?? state.initiationSource,
    reportTargets: patch.reportTargets ?? state.reportTargets,
    lastRunId: patch.lastRunId ?? state.lastRunId,
    lastTaskPacketRef: patch.lastTaskPacketRef ?? state.lastTaskPacketRef,
    lastEvidenceRefs: patch.lastEvidenceRefs ?? state.lastEvidenceRefs,
    lastResult: patch.lastResult ?? state.lastResult,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  });
}

export function resolveNextAutonomyAction(state: AutonomyState): string | null {
  if (state.verificationState === "blocked" || state.phase === "blocked") {
    return null;
  }
  return state.nextActions[0] ?? null;
}
