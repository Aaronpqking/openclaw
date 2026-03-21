import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { getAutonomyStateForSession } from "../control-plane/autonomy-state-store.js";
import { delegateCompactionToRuntime } from "./delegate.js";
import { registerContextEngineForOwner } from "./registry.js";
import type {
  AssembleResult,
  CompactResult,
  ContextEngine,
  ContextEngineInfo,
  ContextEngineRuntimeContext,
  IngestResult,
} from "./types.js";

function buildControlPlanePrompt(
  state: Awaited<ReturnType<typeof getAutonomyStateForSession>>,
): string {
  if (!state) {
    return "";
  }
  const lines = [
    "OpenClaw control-plane context:",
    `- Project/build/phase: ${state.project}/${state.build}/${state.phase}`,
    `- Objective: ${state.objective}`,
    `- Verification state: ${state.verificationState}`,
    `- Authority level: ${state.authorityLevel}`,
  ];
  if (state.allowedActionScopes && state.allowedActionScopes.length > 0) {
    lines.push(`- Allowed action scopes: ${state.allowedActionScopes.join(", ")}`);
  }
  if (state.allowedActions && state.allowedActions.length > 0) {
    lines.push(`- Allowed actions: ${state.allowedActions.join(", ")}`);
  }
  if (state.initiationSource) {
    lines.push(`- Initiation source: ${state.initiationSource}`);
  }
  if (state.blockers.length > 0) {
    lines.push(`- Active blockers: ${state.blockers.join(" | ")}`);
  }
  if (state.nextActions.length > 0) {
    lines.push(`- Next actions: ${state.nextActions.join(" | ")}`);
  }
  if (state.lastResult) {
    lines.push(`- Last result: ${state.lastResult}`);
  }
  if (state.reportTargets && state.reportTargets.length > 0) {
    const targets = state.reportTargets.map((target) => {
      const immediacy = target.immediate === false ? "deferred" : "immediate";
      return `${target.channel}:${target.target} (${immediacy})`;
    });
    lines.push(`- Report targets: ${targets.join(", ")}`);
  }
  lines.push("- Execute operator-requested in-scope actions without duplicate approval prompts.");
  lines.push(
    "- For self-driven consequential actions, stop and request approval instead of acting.",
  );
  return lines.join("\n");
}

export class ControlPlaneContextEngine implements ContextEngine {
  readonly info: ContextEngineInfo = {
    id: "control-plane",
    name: "Control Plane Context Engine",
    version: "1.0.0",
  };

  async ingest(_params: {
    sessionId: string;
    sessionKey?: string;
    message: AgentMessage;
    isHeartbeat?: boolean;
  }): Promise<IngestResult> {
    return { ingested: false };
  }

  async assemble(params: {
    sessionId: string;
    sessionKey?: string;
    messages: AgentMessage[];
    tokenBudget?: number;
  }): Promise<AssembleResult> {
    const state = params.sessionKey
      ? await getAutonomyStateForSession({ sessionKey: params.sessionKey })
      : null;
    const systemPromptAddition = buildControlPlanePrompt(state);
    return {
      messages: params.messages,
      estimatedTokens: 0,
      systemPromptAddition: systemPromptAddition || undefined,
    };
  }

  async afterTurn(_params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile: string;
    messages: AgentMessage[];
    prePromptMessageCount: number;
    autoCompactionSummary?: string;
    isHeartbeat?: boolean;
    tokenBudget?: number;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<void> {
    // Gateway/control-plane ingress owns writeback in v1.
  }

  async compact(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile: string;
    tokenBudget?: number;
    force?: boolean;
    currentTokenCount?: number;
    compactionTarget?: "budget" | "threshold";
    customInstructions?: string;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<CompactResult> {
    return await delegateCompactionToRuntime(params);
  }
}

export function registerControlPlaneContextEngine(): void {
  registerContextEngineForOwner("control-plane", () => new ControlPlaneContextEngine(), "core", {
    allowSameOwnerRefresh: true,
  });
}
