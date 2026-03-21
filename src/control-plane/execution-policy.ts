import type { TaskPacketActionScope, TaskPacketInitiationSource } from "./task-packet.js";

export const EXECUTION_POLICY_ID = "memory-v1-default";

export type ControlActionClass =
  | "read"
  | "plan"
  | "verify"
  | "send"
  | "edit"
  | "schedule"
  | "deploy"
  | "restart"
  | "write_memory"
  | "delete"
  | "policy_change";

export type MatrixActionClass =
  | "observe"
  | "edit"
  | "schedule"
  | "send"
  | "operate"
  | "memory_write"
  | "policy_change"
  | "destructive";

export type ExecutionApprovalMode = "none" | "bounded_auto" | "explicit";
type MatrixPolicyMode = ExecutionApprovalMode | "n/a";
type ScopedPolicyMatrix = Record<MatrixActionClass, MatrixPolicyMode>;
type InitiationPolicyMatrix = Record<TaskPacketActionScope, ScopedPolicyMatrix>;

export type ExecutionPolicyDecision =
  | {
      allowed: true;
      approvalMode: ExecutionApprovalMode;
      reason: string;
      matrixActionClass: MatrixActionClass;
      policyId: string;
    }
  | {
      allowed: false;
      approvalMode: "explicit";
      reason: string;
      matrixActionClass: MatrixActionClass;
      policyId: string;
      deniedAs: "blocked" | "approval_required";
    };

const OPERATOR_REQUESTED_MATRIX: InitiationPolicyMatrix = {
  cursor_workspace: {
    observe: "none",
    edit: "none",
    schedule: "bounded_auto",
    send: "bounded_auto",
    operate: "bounded_auto",
    memory_write: "bounded_auto",
    policy_change: "explicit",
    destructive: "explicit",
  },
  operator_thread: {
    observe: "none",
    edit: "none",
    schedule: "none",
    send: "none",
    operate: "n/a",
    memory_write: "bounded_auto",
    policy_change: "explicit",
    destructive: "explicit",
  },
  external_runtime: {
    observe: "none",
    edit: "bounded_auto",
    schedule: "bounded_auto",
    send: "bounded_auto",
    operate: "bounded_auto",
    memory_write: "bounded_auto",
    policy_change: "explicit",
    destructive: "explicit",
  },
  tenant_surface: {
    observe: "none",
    edit: "bounded_auto",
    schedule: "bounded_auto",
    send: "bounded_auto",
    operate: "bounded_auto",
    memory_write: "bounded_auto",
    policy_change: "explicit",
    destructive: "explicit",
  },
  global: {
    observe: "none",
    edit: "bounded_auto",
    schedule: "bounded_auto",
    send: "bounded_auto",
    operate: "bounded_auto",
    memory_write: "bounded_auto",
    policy_change: "explicit",
    destructive: "explicit",
  },
};

const SELF_DRIVEN_MATRIX: InitiationPolicyMatrix = {
  cursor_workspace: {
    observe: "none",
    edit: "bounded_auto",
    schedule: "explicit",
    send: "explicit",
    operate: "explicit",
    memory_write: "bounded_auto",
    policy_change: "explicit",
    destructive: "explicit",
  },
  operator_thread: {
    observe: "none",
    edit: "bounded_auto",
    schedule: "explicit",
    send: "explicit",
    operate: "n/a",
    memory_write: "bounded_auto",
    policy_change: "explicit",
    destructive: "explicit",
  },
  external_runtime: {
    observe: "none",
    edit: "explicit",
    schedule: "explicit",
    send: "explicit",
    operate: "explicit",
    memory_write: "explicit",
    policy_change: "explicit",
    destructive: "explicit",
  },
  tenant_surface: {
    observe: "none",
    edit: "explicit",
    schedule: "explicit",
    send: "explicit",
    operate: "explicit",
    memory_write: "explicit",
    policy_change: "explicit",
    destructive: "explicit",
  },
  global: {
    observe: "none",
    edit: "explicit",
    schedule: "explicit",
    send: "explicit",
    operate: "explicit",
    memory_write: "explicit",
    policy_change: "explicit",
    destructive: "explicit",
  },
};

function resolveMatrixActionClass(actionClass: ControlActionClass): MatrixActionClass {
  switch (actionClass) {
    case "read":
    case "plan":
    case "verify":
      return "observe";
    case "edit":
      return "edit";
    case "schedule":
      return "schedule";
    case "send":
      return "send";
    case "deploy":
    case "restart":
      return "operate";
    case "write_memory":
      return "memory_write";
    case "policy_change":
      return "policy_change";
    case "delete":
      return "destructive";
  }
}

function resolveMatrixMode(params: {
  initiationSource: TaskPacketInitiationSource;
  actionScope: TaskPacketActionScope;
  matrixActionClass: MatrixActionClass;
}): MatrixPolicyMode | null {
  if (params.initiationSource === "operator_requested") {
    return OPERATOR_REQUESTED_MATRIX[params.actionScope][params.matrixActionClass];
  }
  if (params.initiationSource === "self_driven") {
    return SELF_DRIVEN_MATRIX[params.actionScope][params.matrixActionClass];
  }
  return null;
}

export function resolveExecutionPolicyDecision(params: {
  initiationSource: TaskPacketInitiationSource;
  actionScope: TaskPacketActionScope;
  actionClass: ControlActionClass;
}): ExecutionPolicyDecision {
  const matrixActionClass = resolveMatrixActionClass(params.actionClass);
  const mode = resolveMatrixMode({ ...params, matrixActionClass });
  if (mode === "n/a") {
    return {
      allowed: false,
      approvalMode: "explicit",
      deniedAs: "blocked",
      reason: `${params.actionClass} is not permitted for ${params.actionScope} in ${params.initiationSource} mode`,
      matrixActionClass,
      policyId: EXECUTION_POLICY_ID,
    };
  }
  if (mode === "explicit") {
    return {
      allowed: false,
      approvalMode: "explicit",
      deniedAs: "approval_required",
      reason: `${params.initiationSource} ${params.actionClass} action requires explicit approval in ${params.actionScope}`,
      matrixActionClass,
      policyId: EXECUTION_POLICY_ID,
    };
  }
  if (mode === "none" || mode === "bounded_auto") {
    return {
      allowed: true,
      approvalMode: mode,
      reason:
        mode === "none"
          ? `${params.initiationSource} ${params.actionClass} action is auto-approved in ${params.actionScope}`
          : `${params.initiationSource} ${params.actionClass} action is bounded-auto in ${params.actionScope}`,
      matrixActionClass,
      policyId: EXECUTION_POLICY_ID,
    };
  }

  // Default for non-matrix initiation sources like scheduled/external_triggered.
  if (matrixActionClass === "observe") {
    return {
      allowed: true,
      approvalMode: "bounded_auto",
      reason: `${params.initiationSource} ${params.actionClass} action is bounded-auto in ${params.actionScope}`,
      matrixActionClass,
      policyId: EXECUTION_POLICY_ID,
    };
  }
  if (matrixActionClass === "edit" && params.actionScope === "cursor_workspace") {
    return {
      allowed: true,
      approvalMode: "bounded_auto",
      reason: `${params.initiationSource} edit action is bounded-auto in ${params.actionScope}`,
      matrixActionClass,
      policyId: EXECUTION_POLICY_ID,
    };
  }
  return {
    allowed: false,
    approvalMode: "explicit",
    deniedAs: "approval_required",
    reason: `${params.initiationSource} ${params.actionClass} action requires approval in ${params.actionScope}`,
    matrixActionClass,
    policyId: EXECUTION_POLICY_ID,
  };
}
