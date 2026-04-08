import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import { resolveSendableOutboundReplyParts } from "openclaw/plugin-sdk/reply-payload";
import { parseReplyDirectives } from "../auto-reply/reply/reply-directives.js";
import { SILENT_REPLY_TOKEN } from "../auto-reply/tokens.js";
import { emitAgentEvent } from "../infra/agent-events.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { createInlineCodeState } from "../markdown/code-spans.js";
import {
  isMessagingToolDuplicateNormalized,
  normalizeTextForComparison,
} from "./pi-embedded-helpers.js";
import {
  peekRouteAuditSummaryForRun,
  type RouteAuditSummary,
} from "./pi-embedded-subscribe.handlers.tools.js";
import type { EmbeddedPiSubscribeContext } from "./pi-embedded-subscribe.handlers.types.js";
import { appendRawStream } from "./pi-embedded-subscribe.raw-stream.js";
import {
  extractAssistantText,
  extractAssistantThinking,
  extractThinkingFromTaggedStream,
  extractThinkingFromTaggedText,
  formatReasoningMessage,
  promoteThinkingTagsToBlocks,
} from "./pi-embedded-utils.js";
import { peekRetrievalTraceForRun, type RetrievalTraceSnapshot } from "./retrieval-trace.js";

const answerPolicyLog = createSubsystemLogger("agents/answer-policy");

const stripTrailingDirective = (text: string): string => {
  const openIndex = text.lastIndexOf("[[");
  if (openIndex < 0) {
    if (text.endsWith("[")) {
      return text.slice(0, -1);
    }
    return text;
  }
  const closeIndex = text.indexOf("]]", openIndex + 2);
  if (closeIndex >= 0) {
    return text;
  }
  return text.slice(0, openIndex);
};

function emitReasoningEnd(ctx: EmbeddedPiSubscribeContext) {
  if (!ctx.state.reasoningStreamOpen) {
    return;
  }
  ctx.state.reasoningStreamOpen = false;
  void ctx.params.onReasoningEnd?.();
}

function hasCompletionClaim(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    /\b(i|we)\s+(fixed|repaired|restored|completed|finished|deployed|updated|changed|switched|set)\b/i.test(
      normalized,
    ) ||
    /\b(done|completed|resolved|shipped|rolled out)\b/i.test(normalized) ||
    normalized.includes("✅")
  );
}

export function applyVerifiedAnswerPolicy(params: {
  text: string;
  retrievalTrace?: RetrievalTraceSnapshot | null;
  routeAuditSummary?: RouteAuditSummary | null;
}): {
  text: string;
  policy_enforced: boolean;
  answer_truthfulness_mode: "verified" | "guarded_unverified" | "guarded_unverified_action";
  freshness_required: boolean;
  verification_status: "verified" | "unverified" | "source_unavailable";
  task_completed_verified: boolean;
  reason: "none" | "freshness_unverified" | "completion_unverified";
} {
  const baseText = params.text.trim();
  const freshnessRequired = params.retrievalTrace?.freshness_required === true;
  const verificationStatus = params.retrievalTrace?.verification_status ?? "unverified";
  const taskCompletedVerified = params.routeAuditSummary?.task_completed_verified === true;

  if (freshnessRequired && verificationStatus !== "verified") {
    const unavailableSuffix =
      verificationStatus === "source_unavailable"
        ? " Live source verification was unavailable in this run."
        : "";
    return {
      text: `I couldn't verify this against a live source in this run, so I can't provide a confirmed current-state answer.${unavailableSuffix}`,
      policy_enforced: true,
      answer_truthfulness_mode: "guarded_unverified",
      freshness_required: freshnessRequired,
      verification_status: verificationStatus,
      task_completed_verified: taskCompletedVerified,
      reason: "freshness_unverified",
    };
  }

  if (baseText && hasCompletionClaim(baseText) && !taskCompletedVerified) {
    return {
      text: "I can't claim completion for that action because this run did not produce a verified completion signal (task_completed_verified=false).",
      policy_enforced: true,
      answer_truthfulness_mode: "guarded_unverified_action",
      freshness_required: freshnessRequired,
      verification_status: verificationStatus,
      task_completed_verified: taskCompletedVerified,
      reason: "completion_unverified",
    };
  }

  return {
    text: params.text,
    policy_enforced: false,
    answer_truthfulness_mode: verificationStatus === "verified" ? "verified" : "guarded_unverified",
    freshness_required: freshnessRequired,
    verification_status: verificationStatus,
    task_completed_verified: taskCompletedVerified,
    reason: "none",
  };
}

export function resolveSilentReplyFallbackText(params: {
  text: string;
  messagingToolSentTexts: string[];
}): string {
  const trimmed = params.text.trim();
  if (trimmed !== SILENT_REPLY_TOKEN) {
    return params.text;
  }
  const fallback = params.messagingToolSentTexts.at(-1)?.trim();
  if (!fallback) {
    return params.text;
  }
  return fallback;
}

export function hasAssistantVisibleReply(params: {
  text?: string;
  mediaUrls?: string[];
  mediaUrl?: string;
  audioAsVoice?: boolean;
}): boolean {
  return resolveSendableOutboundReplyParts(params).hasContent || Boolean(params.audioAsVoice);
}

export function buildAssistantStreamData(params: {
  text?: string;
  delta?: string;
  mediaUrls?: string[];
  mediaUrl?: string;
}): { text: string; delta: string; mediaUrls?: string[] } {
  const mediaUrls = resolveSendableOutboundReplyParts(params).mediaUrls;
  return {
    text: params.text ?? "",
    delta: params.delta ?? "",
    mediaUrls: mediaUrls.length ? mediaUrls : undefined,
  };
}

export function handleMessageStart(
  ctx: EmbeddedPiSubscribeContext,
  evt: AgentEvent & { message: AgentMessage },
) {
  const msg = evt.message;
  if (msg?.role !== "assistant") {
    return;
  }

  // KNOWN: Resetting at `text_end` is unsafe (late/duplicate end events).
  // ASSUME: `message_start` is the only reliable boundary for “new assistant message begins”.
  // Start-of-message is a safer reset point than message_end: some providers
  // may deliver late text_end updates after message_end, which would otherwise
  // re-trigger block replies.
  ctx.resetAssistantMessageState(ctx.state.assistantTexts.length);
  // Use assistant message_start as the earliest "writing" signal for typing.
  void ctx.params.onAssistantMessageStart?.();
}

export function handleMessageUpdate(
  ctx: EmbeddedPiSubscribeContext,
  evt: AgentEvent & { message: AgentMessage; assistantMessageEvent?: unknown },
) {
  const msg = evt.message;
  if (msg?.role !== "assistant") {
    return;
  }

  ctx.noteLastAssistant(msg);
  if (ctx.state.deterministicApprovalPromptSent) {
    return;
  }

  const assistantEvent = evt.assistantMessageEvent;
  const assistantRecord =
    assistantEvent && typeof assistantEvent === "object"
      ? (assistantEvent as Record<string, unknown>)
      : undefined;
  const evtType = typeof assistantRecord?.type === "string" ? assistantRecord.type : "";

  if (evtType === "thinking_start" || evtType === "thinking_delta" || evtType === "thinking_end") {
    if (evtType === "thinking_start" || evtType === "thinking_delta") {
      ctx.state.reasoningStreamOpen = true;
    }
    const thinkingDelta = typeof assistantRecord?.delta === "string" ? assistantRecord.delta : "";
    const thinkingContent =
      typeof assistantRecord?.content === "string" ? assistantRecord.content : "";
    appendRawStream({
      ts: Date.now(),
      event: "assistant_thinking_stream",
      runId: ctx.params.runId,
      sessionId: (ctx.params.session as { id?: string }).id,
      evtType,
      delta: thinkingDelta,
      content: thinkingContent,
    });
    if (ctx.state.streamReasoning) {
      // Prefer full partial-message thinking when available; fall back to event payloads.
      const partialThinking = extractAssistantThinking(msg);
      ctx.emitReasoningStream(partialThinking || thinkingContent || thinkingDelta);
    }
    if (evtType === "thinking_end") {
      if (!ctx.state.reasoningStreamOpen) {
        ctx.state.reasoningStreamOpen = true;
      }
      emitReasoningEnd(ctx);
    }
    return;
  }

  if (evtType !== "text_delta" && evtType !== "text_start" && evtType !== "text_end") {
    return;
  }

  const delta = typeof assistantRecord?.delta === "string" ? assistantRecord.delta : "";
  const content = typeof assistantRecord?.content === "string" ? assistantRecord.content : "";

  appendRawStream({
    ts: Date.now(),
    event: "assistant_text_stream",
    runId: ctx.params.runId,
    sessionId: (ctx.params.session as { id?: string }).id,
    evtType,
    delta,
    content,
  });

  let chunk = "";
  if (evtType === "text_delta") {
    chunk = delta;
  } else if (evtType === "text_start" || evtType === "text_end") {
    if (delta) {
      chunk = delta;
    } else if (content) {
      // KNOWN: Some providers resend full content on `text_end`.
      // We only append a suffix (or nothing) to keep output monotonic.
      if (content.startsWith(ctx.state.deltaBuffer)) {
        chunk = content.slice(ctx.state.deltaBuffer.length);
      } else if (ctx.state.deltaBuffer.startsWith(content)) {
        chunk = "";
      } else if (!ctx.state.deltaBuffer.includes(content)) {
        chunk = content;
      }
    }
  }

  if (chunk) {
    ctx.state.deltaBuffer += chunk;
    if (ctx.blockChunker) {
      ctx.blockChunker.append(chunk);
    } else {
      ctx.state.blockBuffer += chunk;
    }
  }

  if (ctx.state.streamReasoning) {
    // Handle partial <think> tags: stream whatever reasoning is visible so far.
    ctx.emitReasoningStream(extractThinkingFromTaggedStream(ctx.state.deltaBuffer));
  }

  const next = ctx
    .stripBlockTags(ctx.state.deltaBuffer, {
      thinking: false,
      final: false,
      inlineCode: createInlineCodeState(),
    })
    .trim();
  if (next) {
    const wasThinking = ctx.state.partialBlockState.thinking;
    const visibleDelta = chunk ? ctx.stripBlockTags(chunk, ctx.state.partialBlockState) : "";
    if (!wasThinking && ctx.state.partialBlockState.thinking) {
      ctx.state.reasoningStreamOpen = true;
    }
    // Detect when thinking block ends (</think> tag processed)
    if (wasThinking && !ctx.state.partialBlockState.thinking) {
      emitReasoningEnd(ctx);
    }
    const parsedDelta = visibleDelta ? ctx.consumePartialReplyDirectives(visibleDelta) : null;
    const parsedFull = parseReplyDirectives(stripTrailingDirective(next));
    const cleanedText = parsedFull.text;
    const { mediaUrls, hasMedia } = resolveSendableOutboundReplyParts(parsedDelta ?? {});
    const hasAudio = Boolean(parsedDelta?.audioAsVoice);
    const previousCleaned = ctx.state.lastStreamedAssistantCleaned ?? "";

    let shouldEmit = false;
    let deltaText = "";
    if (!hasAssistantVisibleReply({ text: cleanedText, mediaUrls, audioAsVoice: hasAudio })) {
      shouldEmit = false;
    } else if (previousCleaned && !cleanedText.startsWith(previousCleaned)) {
      shouldEmit = false;
    } else {
      deltaText = cleanedText.slice(previousCleaned.length);
      shouldEmit = Boolean(deltaText || hasMedia || hasAudio);
    }

    ctx.state.lastStreamedAssistant = next;
    ctx.state.lastStreamedAssistantCleaned = cleanedText;

    if (shouldEmit) {
      const data = buildAssistantStreamData({
        text: cleanedText,
        delta: deltaText,
        mediaUrls,
      });
      emitAgentEvent({
        runId: ctx.params.runId,
        stream: "assistant",
        data,
      });
      void ctx.params.onAgentEvent?.({
        stream: "assistant",
        data,
      });
      ctx.state.emittedAssistantUpdate = true;
      if (ctx.params.onPartialReply && ctx.state.shouldEmitPartialReplies) {
        void ctx.params.onPartialReply(data);
      }
    }
  }

  if (ctx.params.onBlockReply && ctx.blockChunking && ctx.state.blockReplyBreak === "text_end") {
    ctx.blockChunker?.drain({ force: false, emit: ctx.emitBlockChunk });
  }

  if (evtType === "text_end" && ctx.state.blockReplyBreak === "text_end") {
    ctx.flushBlockReplyBuffer();
  }
}

export function handleMessageEnd(
  ctx: EmbeddedPiSubscribeContext,
  evt: AgentEvent & { message: AgentMessage },
) {
  const msg = evt.message;
  if (msg?.role !== "assistant") {
    return;
  }

  const assistantMessage = msg;
  ctx.noteLastAssistant(assistantMessage);
  ctx.recordAssistantUsage((assistantMessage as { usage?: unknown }).usage);
  if (ctx.state.deterministicApprovalPromptSent) {
    return;
  }
  promoteThinkingTagsToBlocks(assistantMessage);

  const rawText = extractAssistantText(assistantMessage);
  appendRawStream({
    ts: Date.now(),
    event: "assistant_message_end",
    runId: ctx.params.runId,
    sessionId: (ctx.params.session as { id?: string }).id,
    rawText,
    rawThinking: extractAssistantThinking(assistantMessage),
  });

  let text = resolveSilentReplyFallbackText({
    text: ctx.stripBlockTags(rawText, { thinking: false, final: false }),
    messagingToolSentTexts: ctx.state.messagingToolSentTexts,
  });
  const rawThinking =
    ctx.state.includeReasoning || ctx.state.streamReasoning
      ? extractAssistantThinking(assistantMessage) || extractThinkingFromTaggedText(rawText)
      : "";
  const formattedReasoning = rawThinking ? formatReasoningMessage(rawThinking) : "";
  const trimmedText = text.trim();
  const parsedText = trimmedText ? parseReplyDirectives(stripTrailingDirective(trimmedText)) : null;
  let cleanedText = parsedText?.text ?? "";
  let { mediaUrls, hasMedia } = resolveSendableOutboundReplyParts(parsedText ?? {});
  const retrievalTrace = peekRetrievalTraceForRun(ctx.params.runId);
  const routeAuditSummary = peekRouteAuditSummaryForRun(ctx.params.runId);
  const policy = applyVerifiedAnswerPolicy({
    text: cleanedText || text,
    retrievalTrace,
    routeAuditSummary,
  });
  if (policy.policy_enforced) {
    const policyText = policy.text.trim();
    text = policyText;
    cleanedText = policyText;
    mediaUrls = [];
    hasMedia = false;
  }
  const answerPolicyData = {
    phase: "answer_policy",
    freshness_required: policy.freshness_required,
    verification_status: policy.verification_status,
    task_completed_verified: policy.task_completed_verified,
    answer_truthfulness_mode: policy.answer_truthfulness_mode,
    policy_enforced: policy.policy_enforced,
    reason: policy.reason,
    requested_model: retrievalTrace?.requested_model ?? "unknown",
    resolved_model: retrievalTrace?.resolved_model ?? "unknown",
  };
  emitAgentEvent({
    runId: ctx.params.runId,
    stream: "lifecycle",
    data: answerPolicyData,
  });
  void ctx.params.onAgentEvent?.({
    stream: "lifecycle",
    data: answerPolicyData,
  });
  answerPolicyLog.info(
    `answer_policy ${JSON.stringify({ run_id: ctx.params.runId, ...answerPolicyData })}`,
  );

  if (!cleanedText && !hasMedia && !ctx.params.enforceFinalTag) {
    const rawTrimmed = rawText.trim();
    const rawStrippedFinal = rawTrimmed.replace(/<\s*\/?\s*final\s*>/gi, "").trim();
    const rawCandidate = rawStrippedFinal || rawTrimmed;
    if (rawCandidate) {
      const parsedFallback = parseReplyDirectives(stripTrailingDirective(rawCandidate));
      cleanedText = parsedFallback.text ?? rawCandidate;
      ({ mediaUrls, hasMedia } = resolveSendableOutboundReplyParts(parsedFallback));
    }
  }

  if (!ctx.state.emittedAssistantUpdate && (cleanedText || hasMedia)) {
    const data = buildAssistantStreamData({
      text: cleanedText,
      delta: cleanedText,
      mediaUrls,
    });
    emitAgentEvent({
      runId: ctx.params.runId,
      stream: "assistant",
      data,
    });
    void ctx.params.onAgentEvent?.({
      stream: "assistant",
      data,
    });
    ctx.state.emittedAssistantUpdate = true;
  }

  const addedDuringMessage = ctx.state.assistantTexts.length > ctx.state.assistantTextBaseline;
  const chunkerHasBuffered = ctx.blockChunker?.hasBuffered() ?? false;
  ctx.finalizeAssistantTexts({ text, addedDuringMessage, chunkerHasBuffered });

  const onBlockReply = ctx.params.onBlockReply;
  const emitBlockReplySafely = (payload: Parameters<NonNullable<typeof onBlockReply>>[0]) => {
    if (!onBlockReply) {
      return;
    }
    void Promise.resolve()
      .then(() => onBlockReply(payload))
      .catch((err) => {
        ctx.log.warn(`block reply callback failed: ${String(err)}`);
      });
  };
  const shouldEmitReasoning = Boolean(
    ctx.state.includeReasoning &&
    formattedReasoning &&
    onBlockReply &&
    formattedReasoning !== ctx.state.lastReasoningSent,
  );
  const shouldEmitReasoningBeforeAnswer =
    shouldEmitReasoning && ctx.state.blockReplyBreak === "message_end" && !addedDuringMessage;
  const maybeEmitReasoning = () => {
    if (!shouldEmitReasoning || !formattedReasoning) {
      return;
    }
    ctx.state.lastReasoningSent = formattedReasoning;
    emitBlockReplySafely({ text: formattedReasoning, isReasoning: true });
  };

  if (shouldEmitReasoningBeforeAnswer) {
    maybeEmitReasoning();
  }

  const emitSplitResultAsBlockReply = (
    splitResult: ReturnType<typeof ctx.consumeReplyDirectives> | null | undefined,
  ) => {
    if (!splitResult || !onBlockReply) {
      return;
    }
    const {
      text: cleanedText,
      mediaUrls,
      audioAsVoice,
      replyToId,
      replyToTag,
      replyToCurrent,
    } = splitResult;
    // Emit if there's content OR audioAsVoice flag (to propagate the flag).
    if (hasAssistantVisibleReply({ text: cleanedText, mediaUrls, audioAsVoice })) {
      emitBlockReplySafely({
        text: cleanedText,
        mediaUrls: mediaUrls?.length ? mediaUrls : undefined,
        audioAsVoice,
        replyToId,
        replyToTag,
        replyToCurrent,
      });
    }
  };

  if (
    (ctx.state.blockReplyBreak === "message_end" ||
      (ctx.blockChunker ? ctx.blockChunker.hasBuffered() : ctx.state.blockBuffer.length > 0)) &&
    text &&
    onBlockReply
  ) {
    if (ctx.blockChunker?.hasBuffered()) {
      ctx.blockChunker.drain({ force: true, emit: ctx.emitBlockChunk });
      ctx.blockChunker.reset();
    } else if (text !== ctx.state.lastBlockReplyText) {
      // Check for duplicates before emitting (same logic as emitBlockChunk).
      const normalizedText = normalizeTextForComparison(text);
      if (
        isMessagingToolDuplicateNormalized(
          normalizedText,
          ctx.state.messagingToolSentTextsNormalized,
        )
      ) {
        ctx.log.debug(
          `Skipping message_end block reply - already sent via messaging tool: ${text.slice(0, 50)}...`,
        );
      } else {
        ctx.state.lastBlockReplyText = text;
        emitSplitResultAsBlockReply(ctx.consumeReplyDirectives(text, { final: true }));
      }
    }
  }

  if (!shouldEmitReasoningBeforeAnswer) {
    maybeEmitReasoning();
  }
  if (ctx.state.streamReasoning && rawThinking) {
    ctx.emitReasoningStream(rawThinking);
  }

  if (ctx.state.blockReplyBreak === "text_end" && onBlockReply) {
    emitSplitResultAsBlockReply(ctx.consumeReplyDirectives("", { final: true }));
  }

  ctx.state.deltaBuffer = "";
  ctx.state.blockBuffer = "";
  ctx.blockChunker?.reset();
  ctx.state.blockState.thinking = false;
  ctx.state.blockState.final = false;
  ctx.state.blockState.inlineCode = createInlineCodeState();
  ctx.state.lastStreamedAssistant = undefined;
  ctx.state.lastStreamedAssistantCleaned = undefined;
  ctx.state.reasoningStreamOpen = false;
}
