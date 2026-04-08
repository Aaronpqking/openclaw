type RetrievalLayer =
  | "active_conversation"
  | "recent_session_cache"
  | "current_daily_memory"
  | "rolling_recent_daily_window"
  | "deeper_durable_notes"
  | "live_connected_data_sources";

const RETRIEVAL_POLICY_VERSION = "2026-04-05.det-v1";

export type RetrievalTraceSnapshot = {
  checked_layers: RetrievalLayer[];
  selected_layer: RetrievalLayer;
  escalated_to_live_source: boolean;
  selected_source: string | null;
  contributing_sources: string[];
  multi_source_synthesis: boolean;
  derived_synthesis: boolean;
  freshness_required: boolean;
  verification_status: "verified" | "unverified" | "source_unavailable";
  confidence: number;
  stale_risk: "low" | "medium" | "high";
  missing_expected_source: boolean;
  requested_model: string;
  resolved_model: string;
  retrieval_policy_version: string;
};

type RetrievalTraceState = RetrievalTraceSnapshot & {
  expected_live_source: boolean;
};

const BASE_LAYERS: RetrievalLayer[] = [
  "active_conversation",
  "recent_session_cache",
  "current_daily_memory",
  "rolling_recent_daily_window",
  "deeper_durable_notes",
  "live_connected_data_sources",
];

const stateByRun = new Map<string, RetrievalTraceState>();
const MAX_TRACKED_RUNS = 512;

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeModelLabel(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "unknown";
}

function resolveInitialState(params: {
  prompt?: string;
  requestedModel?: string;
  resolvedModel?: string;
}): RetrievalTraceState {
  const normalized = params.prompt?.trim().toLowerCase() ?? "";
  const sourceSpecificCue =
    /\b(email|gmail|inbox|mailbox|calendar|drive|document|doc|message|slack|quinn)\b/.test(
      normalized,
    );
  const memoryRecallCue =
    /\b(memory|remember|recall|saved|notes?|memory file|daily file|memproof|phrase|token)\b/.test(
      normalized,
    );
  const browserActionCue =
    /\b(browser|page|tab|upload|click|open https?:\/\/|navigate|current page)\b/.test(normalized);
  const freshnessCue =
    /\b(today|latest|currently|right now|time-sensitive)\b/.test(normalized) ||
    /\bcurrent (?:status|state|health|deployment|runtime|readiness)\b/.test(normalized);
  const operationalStateCue =
    /\b(status|state|healthy|health|readyz|healthz|deployed|deployment|running|connected|linked|available|availability|reachable|working)\b/.test(
      normalized,
    );
  const expectsSource =
    sourceSpecificCue ||
    (freshnessCue && operationalStateCue && !memoryRecallCue && !browserActionCue);
  return {
    checked_layers: [...BASE_LAYERS],
    selected_layer: "active_conversation",
    escalated_to_live_source: false,
    selected_source: null,
    contributing_sources: [],
    multi_source_synthesis: false,
    derived_synthesis: false,
    freshness_required: expectsSource,
    verification_status: "unverified",
    confidence: expectsSource ? 0.52 : 0.64,
    stale_risk: expectsSource ? "medium" : "low",
    missing_expected_source: false,
    expected_live_source: expectsSource,
    requested_model: normalizeModelLabel(params.requestedModel),
    resolved_model: normalizeModelLabel(params.resolvedModel),
    retrieval_policy_version: RETRIEVAL_POLICY_VERSION,
  };
}

function getOrCreateState(runId: string): RetrievalTraceState {
  const existing = stateByRun.get(runId);
  if (existing) {
    return existing;
  }
  const created = resolveInitialState({});
  stateByRun.set(runId, created);
  if (stateByRun.size > MAX_TRACKED_RUNS) {
    const oldest = stateByRun.keys().next().value;
    if (oldest) {
      stateByRun.delete(oldest);
    }
  }
  return created;
}

export function initializeRetrievalTraceForRun(
  runId: string,
  params?: {
    prompt?: string;
    requestedModel?: string;
    resolvedModel?: string;
  },
): void {
  stateByRun.set(
    runId,
    resolveInitialState({
      prompt: params?.prompt,
      requestedModel: params?.requestedModel,
      resolvedModel: params?.resolvedModel,
    }),
  );
  if (stateByRun.size > MAX_TRACKED_RUNS) {
    const oldest = stateByRun.keys().next().value;
    if (oldest && oldest !== runId) {
      stateByRun.delete(oldest);
    }
  }
}

export function markMemoryLayerSelection(params: {
  runId: string;
  path?: string | null;
  now?: Date;
}): void {
  const state = getOrCreateState(params.runId);
  const pathValue = params.path?.trim().replace(/\\/g, "/") ?? "";
  const now = params.now ?? new Date();
  const todayIso = now.toISOString().slice(0, 10);
  if (pathValue && /(^|\/)memory\/\d{4}-\d{2}-\d{2}\.md$/.test(pathValue)) {
    const selectedDate = pathValue.match(/(^|\/)memory\/(\d{4}-\d{2}-\d{2})\.md$/)?.[2] ?? "";
    if (selectedDate === todayIso) {
      state.selected_layer = "current_daily_memory";
      state.confidence = 0.82;
      state.stale_risk = "low";
      return;
    }
    const datedFile = new Date(`${selectedDate}T00:00:00.000Z`);
    const ageMs = Math.abs(now.getTime() - datedFile.getTime());
    if (ageMs <= 7 * 24 * 60 * 60 * 1000) {
      state.selected_layer = "rolling_recent_daily_window";
      state.confidence = 0.76;
      state.stale_risk = "low";
      return;
    }
  }
  if (pathValue && pathValue.includes(`/memory/${todayIso}`)) {
    state.selected_layer = "current_daily_memory";
    state.confidence = 0.82;
    state.stale_risk = "low";
    return;
  }
  const dateMatch = pathValue.match(/\/memory\/(\d{4}-\d{2}-\d{2})\.md$/);
  if (dateMatch) {
    const selectedDate = new Date(`${dateMatch[1]}T00:00:00.000Z`);
    const ageMs = Math.abs(now.getTime() - selectedDate.getTime());
    if (ageMs <= 7 * 24 * 60 * 60 * 1000) {
      state.selected_layer = "rolling_recent_daily_window";
      state.confidence = 0.76;
      state.stale_risk = "low";
      return;
    }
  }
  state.selected_layer = "deeper_durable_notes";
  state.confidence = Math.max(state.confidence, 0.72);
  state.stale_risk = "medium";
}

export function markLiveSourceEscalation(params: { runId: string; source: string }): void {
  const state = getOrCreateState(params.runId);
  const nextSources = [...state.contributing_sources];
  if (!nextSources.includes(params.source)) {
    nextSources.push(params.source);
  }
  state.selected_layer = "live_connected_data_sources";
  state.escalated_to_live_source = true;
  state.selected_source = params.source;
  state.contributing_sources = nextSources;
  state.multi_source_synthesis = nextSources.length > 1;
  state.derived_synthesis = state.multi_source_synthesis;
  state.verification_status = "verified";
  state.confidence = 0.9;
  state.stale_risk = "low";
  state.missing_expected_source = false;
}

export function peekRetrievalTraceModelInfo(runId: string): {
  requested_model: string;
  resolved_model: string;
  retrieval_policy_version: string;
} | null {
  const state = stateByRun.get(runId);
  if (!state) {
    return null;
  }
  return {
    requested_model: state.requested_model,
    resolved_model: state.resolved_model,
    retrieval_policy_version: state.retrieval_policy_version,
  };
}

function buildRetrievalTraceSnapshot(state: RetrievalTraceState): RetrievalTraceSnapshot {
  const missingExpectedSource = state.expected_live_source && !state.escalated_to_live_source;
  const verificationStatus: RetrievalTraceSnapshot["verification_status"] =
    state.escalated_to_live_source
      ? "verified"
      : missingExpectedSource
        ? "source_unavailable"
        : "unverified";
  const staleRisk: RetrievalTraceSnapshot["stale_risk"] = missingExpectedSource
    ? "high"
    : state.stale_risk;
  const confidence = missingExpectedSource ? Math.min(state.confidence, 0.45) : state.confidence;
  return {
    checked_layers: state.checked_layers,
    selected_layer: state.selected_layer,
    escalated_to_live_source: state.escalated_to_live_source,
    selected_source: state.selected_source,
    contributing_sources: [...state.contributing_sources],
    multi_source_synthesis: state.multi_source_synthesis,
    derived_synthesis: state.derived_synthesis,
    freshness_required: state.freshness_required,
    verification_status: verificationStatus,
    confidence: clampConfidence(confidence),
    stale_risk: staleRisk,
    missing_expected_source: missingExpectedSource,
    requested_model: state.requested_model,
    resolved_model: state.resolved_model,
    retrieval_policy_version: state.retrieval_policy_version,
  };
}

export function peekRetrievalTraceForRun(runId: string): RetrievalTraceSnapshot | null {
  const state = stateByRun.get(runId);
  if (!state) {
    return null;
  }
  return buildRetrievalTraceSnapshot(state);
}

export function finalizeRetrievalTraceForRun(runId: string): RetrievalTraceSnapshot | null {
  const state = stateByRun.get(runId);
  if (!state) {
    return null;
  }
  const snapshot = buildRetrievalTraceSnapshot(state);
  stateByRun.delete(runId);
  return snapshot;
}
