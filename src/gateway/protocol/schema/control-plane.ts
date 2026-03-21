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
    requestId: NonEmptyString,
    runId: Type.Optional(NonEmptyString),
    scope: Type.String({ enum: ["global", "project"] }),
    project: Type.String({ enum: ["none", "openclaw", "eleanor", "shared"] }),
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
    allowedActionScopes: Type.Array(
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
    replyMode: Type.String({ enum: ["summary", "detailed", "checkpoint", "enum_only"] }),
    constraints: Type.Optional(Type.Array(NonEmptyString)),
    acceptance: Type.Optional(Type.Array(NonEmptyString)),
    allowedActions: Type.Optional(Type.Array(NonEmptyString)),
    autonomyMode: Type.Optional(
      Type.String({
        enum: ["observe", "propose", "execute_safe", "execute_bounded", "escalate"],
      }),
    ),
    initiationSource: Type.Optional(
      Type.String({
        enum: ["operator_requested", "self_driven", "scheduled", "external_triggered"],
      }),
    ),
    evidenceRefs: Type.Optional(Type.Array(NonEmptyString)),
    reportTargets: Type.Optional(Type.Array(TaskPacketReportTargetSchema)),
  },
  { additionalProperties: false },
);
