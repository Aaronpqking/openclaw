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

const PHASE_LOCKED_TERMINAL: ReadonlySet<TaskPacketPhase> = new Set(["complete"]);
const PHASE_HOLD_STATES: TaskPacketPhase[] = ["blocked", "awaiting_decision", "deferred"];
const ACTIVE_PHASES: TaskPacketPhase[] = [
  "discover",
  "diagnose",
  "design",
  "plan",
  "implement",
  "repair",
  "verify",
  "report",
  "handoff",
];

type PhaseTransitionMatrix = Record<TaskPacketPhase, ReadonlySet<TaskPacketPhase>>;

function createTransitionMatrix(): PhaseTransitionMatrix {
  const matrix = {} as Record<TaskPacketPhase, ReadonlySet<TaskPacketPhase>>;
  const holdSet = new Set<TaskPacketPhase>(PHASE_HOLD_STATES);
  const activeSet = new Set<TaskPacketPhase>(ACTIVE_PHASES);
  const allowedFromActive = (next: TaskPacketPhase[]): ReadonlySet<TaskPacketPhase> =>
    new Set<TaskPacketPhase>([...next, ...PHASE_HOLD_STATES]);

  matrix.discover = allowedFromActive(["diagnose", "design", "plan"]);
  matrix.diagnose = allowedFromActive(["design", "plan", "implement"]);
  matrix.design = allowedFromActive(["plan", "implement"]);
  matrix.plan = allowedFromActive(["implement", "repair", "verify"]);
  matrix.implement = allowedFromActive(["repair", "verify", "report"]);
  matrix.repair = allowedFromActive(["implement", "verify", "report"]);
  matrix.verify = allowedFromActive(["implement", "repair", "report", "handoff"]);
  matrix.report = allowedFromActive(["implement", "repair", "verify", "handoff", "complete"]);
  matrix.handoff = allowedFromActive(["verify", "report", "complete"]);
  matrix.complete = new Set<TaskPacketPhase>(["complete"]);

  // Hold phases can resume into any active phase, remain held, or close if explicitly complete.
  matrix.blocked = new Set<TaskPacketPhase>([...activeSet, ...holdSet, "complete"]);
  matrix.awaiting_decision = new Set<TaskPacketPhase>([...activeSet, ...holdSet, "complete"]);
  matrix.deferred = new Set<TaskPacketPhase>([...activeSet, ...holdSet, "complete"]);
  return matrix;
}

const PHASE_TRANSITION_MATRIX = createTransitionMatrix();

function resolveBoundedPhaseTransition(params: {
  current: TaskPacketPhase;
  requested?: TaskPacketPhase;
}): { phase: TaskPacketPhase; warning?: string } {
  if (!params.requested || params.requested === params.current) {
    return { phase: params.current };
  }
  if (PHASE_LOCKED_TERMINAL.has(params.current)) {
    return {
      phase: params.current,
      warning: `phase transition denied: ${params.current} -> ${params.requested}`,
    };
  }
  const allowed = PHASE_TRANSITION_MATRIX[params.current];
  if (allowed?.has(params.requested)) {
    return { phase: params.requested };
  }
  return {
    phase: params.current,
    warning: `phase transition denied: ${params.current} -> ${params.requested}`,
  };
}

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
  const phaseTransition = resolveBoundedPhaseTransition({
    current: state.phase,
    requested: patch.phase,
  });
  const blockers = patch.blockers ?? state.blockers;
  const boundedBlockers = phaseTransition.warning
    ? [...new Set([...blockers, phaseTransition.warning])]
    : blockers;
  return createAutonomyState({
    ...state,
    phase: phaseTransition.phase,
    blockers: boundedBlockers,
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
