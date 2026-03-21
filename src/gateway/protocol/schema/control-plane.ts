import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const TaskPacketReportTargetSchema = Type.Object(
  {
    channel: Type.String({ enum: ["whatsapp", "operator_thread", "webchat", "email"] }),
    target: NonEmptyString,
    immediate: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const TaskPacketSchema = Type.Object(
  {
    requestId: Type.Optional(NonEmptyString),
    request_id: Type.Optional(NonEmptyString),
    runId: Type.Optional(NonEmptyString),
    run_id: Type.Optional(NonEmptyString),
    scope: Type.String({ enum: ["global", "project"] }),
    project: Type.String({ enum: ["none", "openclaw", "eleanor", "eliteforms", "shared"] }),
    build: Type.String({
      enum: [
        "engine",
        "api",
        "ui",
        "infra",
        "memory",
        "autonomy",
        "execution",
        "policy",
        "trust",
        "channels",
        "google",
        "whatsapp",
        "node",
        "release",
        "docs",
        "tests",
      ],
    }),
    phase: Type.String({
      enum: [
        "discover",
        "diagnose",
        "design",
        "plan",
        "implement",
        "repair",
        "verify",
        "report",
        "blocked",
        "awaiting_decision",
        "deferred",
        "handoff",
        "complete",
      ],
    }),
    objective: NonEmptyString,
    allowed_action_scopes: Type.Optional(
      Type.Array(
        Type.String({
          enum: [
            "global",
            "cursor_workspace",
            "operator_thread",
            "external_runtime",
            "tenant_surface",
          ],
        }),
        { minItems: 1 },
      ),
    ),
    allowedActionScopes: Type.Optional(
      Type.Array(
        Type.String({
          enum: [
            "global",
            "cursor_workspace",
            "operator_thread",
            "external_runtime",
            "tenant_surface",
          ],
        }),
        { minItems: 1 },
      ),
    ),
    reply_mode: Type.Optional(
      Type.String({ enum: ["summary", "detailed", "checkpoint", "enum_only"] }),
    ),
    replyMode: Type.Optional(
      Type.String({ enum: ["summary", "detailed", "checkpoint", "enum_only"] }),
    ),
    constraints: Type.Optional(Type.Array(NonEmptyString)),
    acceptance: Type.Optional(Type.Array(NonEmptyString)),
    allowed_actions: Type.Optional(Type.Array(NonEmptyString)),
    allowedActions: Type.Optional(Type.Array(NonEmptyString)),
    autonomy_mode: Type.Optional(
      Type.String({
        enum: ["observe", "propose", "execute_safe", "execute_bounded", "escalate"],
      }),
    ),
    autonomyMode: Type.Optional(
      Type.String({
        enum: ["observe", "propose", "execute_safe", "execute_bounded", "escalate"],
      }),
    ),
    initiation_source: Type.Optional(
      Type.String({
        enum: ["operator_requested", "self_driven", "scheduled", "external_triggered"],
      }),
    ),
    initiationSource: Type.Optional(
      Type.String({
        enum: ["operator_requested", "self_driven", "scheduled", "external_triggered"],
      }),
    ),
    evidence_refs: Type.Optional(Type.Array(NonEmptyString)),
    evidenceRefs: Type.Optional(Type.Array(NonEmptyString)),
    report_targets: Type.Optional(Type.Array(TaskPacketReportTargetSchema)),
    reportTargets: Type.Optional(Type.Array(TaskPacketReportTargetSchema)),
  },
  { additionalProperties: false },
);
