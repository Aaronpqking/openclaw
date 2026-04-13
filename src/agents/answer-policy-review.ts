import type { RequestClassification } from "./request-classifier.js";

export type AnswerPolicyReviewPayload = {
  event_name: "answer_policy_review";
  run_id: string;
  handler: "pi-embedded-subscribe.handlers.messages";
  request_classification: RequestClassification;
  classification_reason: string;
  freshness_required: boolean;
  verification_attempted: boolean;
  verification_available: boolean;
  limitation_note_applied: boolean;
  response_overridden: boolean;
  has_mixed_intent_signal: boolean;
  intent_shape: RequestClassification;
};

const ANSWER_POLICY_REVIEW_SAMPLE_MODULO = 20;

function stableModuloFromSeed(seed: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % modulo;
  }
  return hash;
}

export function shouldLogAnswerPolicyReviewSample(payload: AnswerPolicyReviewPayload): boolean {
  if (payload.has_mixed_intent_signal || payload.limitation_note_applied) {
    return true;
  }
  return stableModuloFromSeed(payload.run_id, ANSWER_POLICY_REVIEW_SAMPLE_MODULO) === 0;
}

export function buildAnswerPolicyReviewPayload(params: {
  runId: string;
  requestClassification: RequestClassification;
  classificationReason: string;
  freshnessRequired: boolean;
  verificationStatus: "verified" | "unverified" | "source_unavailable";
  limitationNoteApplied: boolean;
  responseOverridden: boolean;
  hasMixedIntentSignal: boolean;
}): AnswerPolicyReviewPayload {
  return {
    event_name: "answer_policy_review",
    run_id: params.runId,
    handler: "pi-embedded-subscribe.handlers.messages",
    request_classification: params.requestClassification,
    classification_reason: params.classificationReason,
    freshness_required: params.freshnessRequired,
    verification_attempted: params.freshnessRequired,
    verification_available: params.verificationStatus === "verified",
    limitation_note_applied: params.limitationNoteApplied,
    response_overridden: params.responseOverridden,
    has_mixed_intent_signal: params.hasMixedIntentSignal,
    intent_shape: params.requestClassification,
  };
}
