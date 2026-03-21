import type { ChannelMessageActionName } from "../channels/plugins/types.js";
import type {
  TaskPacket,
  TaskPacketActionScope,
  TaskPacketInitiationSource,
  TaskPacketReportTarget,
} from "./task-packet.js";

export const CONTROL_ACTION_CLASSES = [
  "read",
  "plan",
  "verify",
  "send",
  "edit",
  "schedule",
  "deploy",
  "restart",
  "write_memory",
  "delete",
  "policy_change",
] as const;
export const CONTROL_APPROVAL_MODES = ["none", "bounded_auto", "explicit"] as const;
export const CONTROL_DELIVERY_STATES = [
  "drafted",
  "queued",
  "sent",
  "approval_required",
  "blocked",
  "failed",
] as const;

export type ControlActionClass = (typeof CONTROL_ACTION_CLASSES)[number];
export type ControlApprovalMode = (typeof CONTROL_APPROVAL_MODES)[number];
export type ControlDeliveryState = (typeof CONTROL_DELIVERY_STATES)[number];

export type ApprovalResolution = {
  allowed: boolean;
  approvalMode: ControlApprovalMode;
  deliveryState: ControlDeliveryState;
  reason: string;
  reportImmediately: boolean;
  reportTargets: TaskPacketReportTarget[];
};

const SELF_DRIVEN_EXPLICIT_ACTIONS = new Set<ControlActionClass>([
  "send",
  "schedule",
  "deploy",
  "restart",
  "write_memory",
  "delete",
  "policy_change",
]);

export function resolveApprovalPolicy(params: {
  initiationSource: TaskPacketInitiationSource;
  actionScope: TaskPacketActionScope;
  actionClass: ControlActionClass;
  allowedActionScopes: TaskPacketActionScope[];
  reportTargets?: TaskPacketReportTarget[];
}): ApprovalResolution {
  const reportTargets = params.reportTargets ?? [];
  if (!params.allowedActionScopes.includes(params.actionScope)) {
    return {
      allowed: false,
      approvalMode: "explicit",
      deliveryState: "blocked",
      reason: `action scope ${params.actionScope} is not allowed for this packet`,
      reportImmediately: true,
      reportTargets,
    };
  }

  if (params.initiationSource === "operator_requested") {
    return {
      allowed: true,
      approvalMode: "bounded_auto",
      deliveryState: "queued",
      reason: "explicit operator request acts as the approval for in-scope actions",
      reportImmediately: reportTargets.some((target) => target.immediate !== false),
      reportTargets,
    };
  }

  if (params.initiationSource === "self_driven") {
    if (SELF_DRIVEN_EXPLICIT_ACTIONS.has(params.actionClass)) {
      return {
        allowed: false,
        approvalMode: "explicit",
        deliveryState: "approval_required",
        reason: `self-driven ${params.actionClass} actions require approval`,
        reportImmediately: false,
        reportTargets,
      };
    }
    return {
      allowed: true,
      approvalMode: "bounded_auto",
      deliveryState: "queued",
      reason: `self-driven ${params.actionClass} action is safe within allowed scope`,
      reportImmediately: false,
      reportTargets,
    };
  }

  if (
    params.actionClass === "read" ||
    params.actionClass === "plan" ||
    params.actionClass === "verify"
  ) {
    return {
      allowed: true,
      approvalMode: "bounded_auto",
      deliveryState: "queued",
      reason: `${params.initiationSource} ${params.actionClass} action is safe within allowed scope`,
      reportImmediately: false,
      reportTargets,
    };
  }

  return {
    allowed: false,
    approvalMode: "explicit",
    deliveryState: "approval_required",
    reason: `${params.initiationSource} ${params.actionClass} action requires approval`,
    reportImmediately: false,
    reportTargets,
  };
}

/**
 * Runtime hints for gateway `exec` when TaskPacket targets Eleanor Lite.
 * Maps control-plane approval policy onto the existing exec approval prompt path.
 */
export function resolveEleanorLiteExecApprovalHints(params: {
  taskPacket?: TaskPacket | null;
  actionClass?: ControlActionClass;
  defaultActionScope?: TaskPacketActionScope;
}): {
  blockReason?: string;
  forceRequireApproval: boolean;
  skipApprovalPrompt: boolean;
} {
  const packet = params.taskPacket;
  if (!packet || packet.project !== "eleanor") {
    return { forceRequireApproval: false, skipApprovalPrompt: false };
  }
  const scopes = packet.allowedActionScopes;
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return { forceRequireApproval: false, skipApprovalPrompt: false };
  }
  const actionClass = params.actionClass ?? "edit";
  const initiationSource: TaskPacketInitiationSource =
    packet.initiationSource ?? "external_triggered";
  const actionScope = params.defaultActionScope ?? scopes[0];
  const policy = resolveApprovalPolicy({
    initiationSource,
    actionScope,
    actionClass,
    allowedActionScopes: scopes,
    reportTargets: packet.reportTargets,
  });
  if (!policy.allowed && policy.deliveryState === "blocked") {
    return { blockReason: policy.reason, forceRequireApproval: false, skipApprovalPrompt: false };
  }
  if (!policy.allowed) {
    return { forceRequireApproval: true, skipApprovalPrompt: false };
  }
  if (policy.deliveryState === "approval_required") {
    return { forceRequireApproval: true, skipApprovalPrompt: false };
  }
  if (initiationSource === "operator_requested") {
    return { forceRequireApproval: false, skipApprovalPrompt: true };
  }
  return { forceRequireApproval: false, skipApprovalPrompt: false };
}

export function resolveMessageActionClass(action: ChannelMessageActionName): ControlActionClass {
  switch (action) {
    case "send":
    case "sendWithEffect":
    case "sendAttachment":
    case "reply":
    case "thread-reply":
    case "broadcast":
    case "poll":
      return "send";
    case "edit":
    case "react":
    case "pin":
    case "unpin":
    case "renameGroup":
    case "setGroupIcon":
    case "addParticipant":
    case "removeParticipant":
    case "leaveGroup":
    case "thread-create":
    case "channel-create":
    case "channel-edit":
    case "channel-move":
    case "category-create":
    case "category-edit":
    case "topic-create":
    case "topic-edit":
    case "role-add":
    case "role-remove":
    case "set-profile":
    case "set-presence":
    case "timeout":
    case "kick":
    case "ban":
    case "poll-vote":
    case "sticker":
    case "sticker-upload":
    case "emoji-upload":
      return "edit";
    case "delete":
    case "unsend":
    case "channel-delete":
    case "category-delete":
      return "delete";
    case "event-create":
      return "schedule";
    case "read":
    case "reactions":
    case "list-pins":
    case "permissions":
    case "thread-list":
    case "search":
    case "sticker-search":
    case "member-info":
    case "role-info":
    case "emoji-list":
    case "channel-info":
    case "channel-list":
    case "voice-status":
    case "event-list":
    case "download-file":
      return "read";
    default:
      return "send";
  }
}

export function resolveMessageActionScope(params: {
  taskPacket?: TaskPacket | null;
  channel: string;
  target?: string;
}): TaskPacketActionScope {
  const packet = params.taskPacket;
  const normalizedChannel = params.channel.trim().toLowerCase();
  const normalizedTarget = params.target?.trim();
  const reportMatch = packet?.reportTargets?.some((entry) => {
    if (entry.channel !== normalizedChannel || !normalizedTarget) {
      return false;
    }
    return entry.target.trim() === normalizedTarget;
  });
  if (reportMatch) {
    return "operator_thread";
  }
  return "external_runtime";
}
