import { describe, expect, it } from "vitest";
import {
  finalizeRetrievalTraceForRun,
  initializeRetrievalTraceForRun,
  markLiveSourceEscalation,
  markMemoryLayerSelection,
  peekRetrievalTraceForRun,
} from "./retrieval-trace.js";

describe("retrieval trace", () => {
  it("marks missing_expected_source when a source-specific prompt does not escalate", () => {
    initializeRetrievalTraceForRun("run-missing", {
      prompt: "check Quinn school email updates today",
      requestedModel: "openai/gpt-5.4-mini",
      resolvedModel: "openai/gpt-5.4-mini",
    });
    const trace = finalizeRetrievalTraceForRun("run-missing");
    expect(trace).toMatchObject({
      selected_layer: "active_conversation",
      escalated_to_live_source: false,
      contributing_sources: [],
      multi_source_synthesis: false,
      derived_synthesis: false,
      freshness_required: true,
      verification_status: "source_unavailable",
      missing_expected_source: true,
      stale_risk: "high",
      requested_model: "openai/gpt-5.4-mini",
      resolved_model: "openai/gpt-5.4-mini",
      retrieval_policy_version: expect.stringContaining(".det-v1"),
    });
  });

  it("records gog live-source escalation", () => {
    initializeRetrievalTraceForRun("run-live", {
      prompt: "triage inbox",
      requestedModel: "openai/gpt-5.4-mini",
      resolvedModel: "openai/gpt-5.4-mini",
    });
    markLiveSourceEscalation({ runId: "run-live", source: "gog.gmail" });
    const trace = finalizeRetrievalTraceForRun("run-live");
    expect(trace).toMatchObject({
      selected_layer: "live_connected_data_sources",
      escalated_to_live_source: true,
      selected_source: "gog.gmail",
      contributing_sources: ["gog.gmail"],
      multi_source_synthesis: false,
      derived_synthesis: false,
      freshness_required: true,
      verification_status: "verified",
      missing_expected_source: false,
    });
  });

  it("promotes memory layer selection for current daily files", () => {
    const now = new Date("2026-04-05T12:00:00.000Z");
    initializeRetrievalTraceForRun("run-daily", {
      prompt: "recall recent notes",
      requestedModel: "openai/gpt-5.4-mini",
      resolvedModel: "openai/gpt-5.4-mini",
    });
    markMemoryLayerSelection({
      runId: "run-daily",
      path: "/home/node/.openclaw/agents/main/agent/memory/2026-04-05.md",
      now,
    });
    const trace = finalizeRetrievalTraceForRun("run-daily");
    expect(trace).toMatchObject({
      selected_layer: "current_daily_memory",
      escalated_to_live_source: false,
      contributing_sources: [],
      multi_source_synthesis: false,
      derived_synthesis: false,
      freshness_required: false,
      verification_status: "unverified",
    });
  });

  it("marks derived synthesis when multiple live sources contribute", () => {
    initializeRetrievalTraceForRun("run-multi", {
      prompt: "compare email and drive context",
      requestedModel: "openai/gpt-5.4",
      resolvedModel: "openai/gpt-5.4",
    });
    markLiveSourceEscalation({ runId: "run-multi", source: "gog.gmail" });
    markLiveSourceEscalation({ runId: "run-multi", source: "gog.drive" });
    const trace = finalizeRetrievalTraceForRun("run-multi");
    expect(trace).toMatchObject({
      selected_layer: "live_connected_data_sources",
      selected_source: "gog.drive",
      contributing_sources: ["gog.gmail", "gog.drive"],
      multi_source_synthesis: true,
      derived_synthesis: true,
      verification_status: "verified",
    });
  });

  it("peeks without consuming run state", () => {
    initializeRetrievalTraceForRun("run-peek", {
      prompt: "check inbox now",
      requestedModel: "openai/gpt-5.4",
      resolvedModel: "openai/gpt-5.4",
    });
    const peeked = peekRetrievalTraceForRun("run-peek");
    const finalized = finalizeRetrievalTraceForRun("run-peek");
    expect(peeked).toMatchObject({
      freshness_required: true,
      requested_model: "openai/gpt-5.4",
      resolved_model: "openai/gpt-5.4",
    });
    expect(finalized).toEqual(peeked);
    expect(peekRetrievalTraceForRun("run-peek")).toBeNull();
  });

  it("does not require live verification for same-day memory recall prompts", () => {
    initializeRetrievalTraceForRun("run-memory-recall", {
      prompt: "What memory proof token was saved today?",
      requestedModel: "openai/gpt-5.4-mini",
      resolvedModel: "openai/gpt-5.4-mini",
    });
    const trace = finalizeRetrievalTraceForRun("run-memory-recall");
    expect(trace).toMatchObject({
      freshness_required: false,
      verification_status: "unverified",
      missing_expected_source: false,
    });
  });

  it("does not require live verification for current-page browser actions", () => {
    initializeRetrievalTraceForRun("run-browser-action", {
      prompt: "Use the browser tool to upload /tmp/file.txt to the current page.",
      requestedModel: "openai/gpt-5.4-mini",
      resolvedModel: "openai/gpt-5.4-mini",
    });
    const trace = finalizeRetrievalTraceForRun("run-browser-action");
    expect(trace).toMatchObject({
      freshness_required: false,
      verification_status: "unverified",
      missing_expected_source: false,
    });
  });

  it("still requires live verification for current operational status prompts", () => {
    initializeRetrievalTraceForRun("run-operational-status", {
      prompt: "What is the current deployment status right now?",
      requestedModel: "openai/gpt-5.4-mini",
      resolvedModel: "openai/gpt-5.4-mini",
    });
    const trace = finalizeRetrievalTraceForRun("run-operational-status");
    expect(trace).toMatchObject({
      freshness_required: true,
      verification_status: "source_unavailable",
      missing_expected_source: true,
    });
  });
});
