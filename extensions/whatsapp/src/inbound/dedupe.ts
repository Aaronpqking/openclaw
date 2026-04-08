import { createHash } from "node:crypto";
import { createDedupeCache } from "openclaw/plugin-sdk/infra-runtime";

const RECENT_WEB_MESSAGE_TTL_MS = 20 * 60_000;
const RECENT_WEB_MESSAGE_MAX = 5000;
const RECENT_WEB_REPLAY_TTL_MS = 2 * 60_000;
const RECENT_WEB_REPLAY_MAX = 10_000;
const REPLAY_BUCKET_MS = 1000;

const recentInboundMessages = createDedupeCache({
  ttlMs: RECENT_WEB_MESSAGE_TTL_MS,
  maxSize: RECENT_WEB_MESSAGE_MAX,
});
const recentInboundReplays = createDedupeCache({
  ttlMs: RECENT_WEB_REPLAY_TTL_MS,
  maxSize: RECENT_WEB_REPLAY_MAX,
});

export type InboundDedupeDecision = {
  accepted: boolean;
  reason: "accepted" | "duplicate_provider_message_id" | "replay_hash_bucket";
  dedupeKey?: string;
  replayKey?: string;
  replayHash?: string;
  replayBucket?: number;
};

function normalizeBody(body: string): string {
  return body.trim().replace(/\s+/g, " ");
}

function buildReplayFingerprint(params: {
  accountId: string;
  normalizedPeer: string;
  body: string;
  timestampMs?: number;
}): { replayHash: string; replayBucket: number } {
  const replayBucket = Math.floor((params.timestampMs ?? Date.now()) / REPLAY_BUCKET_MS);
  const replayHash = createHash("sha256")
    .update(params.accountId)
    .update("\n")
    .update(params.normalizedPeer)
    .update("\n")
    .update(String(replayBucket))
    .update("\n")
    .update(normalizeBody(params.body))
    .digest("hex");
  return { replayHash, replayBucket };
}

export function resetWebInboundDedupe(): void {
  recentInboundMessages.clear();
  recentInboundReplays.clear();
}

export function evaluateInboundDedupe(params: {
  accountId: string;
  normalizedPeer: string;
  providerMessageId?: string;
  body: string;
  timestampMs?: number;
}): InboundDedupeDecision {
  if (params.providerMessageId) {
    const dedupeKey = `${params.accountId}:${params.normalizedPeer}:${params.providerMessageId}`;
    if (recentInboundMessages.check(dedupeKey)) {
      return {
        accepted: false,
        reason: "duplicate_provider_message_id",
        dedupeKey,
      };
    }
  }

  const { replayHash, replayBucket } = buildReplayFingerprint(params);
  const replayKey = `${params.accountId}:${params.normalizedPeer}:${replayHash}`;
  if (recentInboundReplays.check(replayKey)) {
    return {
      accepted: false,
      reason: "replay_hash_bucket",
      replayKey,
      replayHash,
      replayBucket,
    };
  }

  return {
    accepted: true,
    reason: "accepted",
    replayKey,
    replayHash,
    replayBucket,
    dedupeKey: params.providerMessageId
      ? `${params.accountId}:${params.normalizedPeer}:${params.providerMessageId}`
      : undefined,
  };
}
