import { hasBinary } from "../agents/skills.js";
import type { OpenClawConfig } from "../config/config.js";
import { runCommandWithTimeout, type SpawnResult } from "../process/exec.js";

export type GoogleWorkspaceVerificationState =
  | "configured_and_verified"
  | "configured_but_unverified"
  | "missing_credentials"
  | "missing_required_scopes"
  | "token_invalid_or_expired"
  | "connector_disabled"
  | "bootstrap_not_run"
  | "provider_api_error"
  | "unknown_internal_error";

export type GoogleWorkspaceService = "gmail" | "calendar" | "drive";

export type GoogleWorkspaceServiceReadiness = {
  service: GoogleWorkspaceService;
  state: GoogleWorkspaceVerificationState;
  message: string;
  missingPrerequisite: string | null;
  deltaProbeCommand: string | null;
  deltaProbeExitCode: number | null;
  deltaCount: number | null;
  stdoutPreview: string | null;
  stderrPreview: string | null;
};

export type GoogleWorkspaceReadinessReport = {
  state: GoogleWorkspaceVerificationState;
  message: string;
  connectorEnabled: boolean;
  account: string | null;
  checkedAt: string;
  services: Record<GoogleWorkspaceService, GoogleWorkspaceServiceReadiness>;
};

type GogRunner = (
  argv: string[],
  opts: { timeoutMs: number; env?: NodeJS.ProcessEnv },
) => Promise<SpawnResult>;

const REQUIRED_SERVICE_SCOPES = "gmail,calendar,drive";

function summarizeText(raw: string, maxLen = 280): string | null {
  const clean = raw.trim().replace(/\s+/g, " ");
  if (!clean) {
    return null;
  }
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

function summarizeCommand(argv: string[]): string {
  return argv.join(" ");
}

function classifyProbeFailure(text: string): {
  state: GoogleWorkspaceVerificationState;
  missingPrerequisite: string | null;
  message: string;
} {
  const lower = text.toLowerCase();
  if (
    lower.includes("credentials") ||
    lower.includes("auth add") ||
    lower.includes("not authenticated") ||
    lower.includes("no account") ||
    lower.includes("login required")
  ) {
    return {
      state: "missing_credentials",
      missingPrerequisite:
        "Run `gog auth credentials <client_secret.json>` then `gog auth add <account> --services gmail,calendar,drive`.",
      message: "Google Workspace credentials are missing or not initialized for gog.",
    };
  }
  if (
    lower.includes("insufficient authentication scopes") ||
    lower.includes("missing scope") ||
    lower.includes("insufficient permission") ||
    lower.includes("forbidden") ||
    lower.includes("permission denied")
  ) {
    return {
      state: "missing_required_scopes",
      missingPrerequisite: `Re-authorize with required scopes: \`gog auth add <account> --services ${REQUIRED_SERVICE_SCOPES}\`.`,
      message: "Google Workspace OAuth scopes are missing required Gmail/Calendar/Drive access.",
    };
  }
  if (
    lower.includes("invalid_grant") ||
    lower.includes("invalid token") ||
    lower.includes("token has expired") ||
    lower.includes("refresh token") ||
    lower.includes("unauthorized")
  ) {
    return {
      state: "token_invalid_or_expired",
      missingPrerequisite:
        `Refresh OAuth tokens: \`gog auth add <account> --services ${REQUIRED_SERVICE_SCOPES}\`. ` +
        "Run re-auth on the **same host** OpenClaw uses for `gog` (VM/container vs laptop tokens are not shared). " +
        "On headless macOS, prefer `gog auth keyring file`, ensure `GOG_KEYRING_PASSWORD`, " +
        `then remote auth: \`gog auth add <account> --services ${REQUIRED_SERVICE_SCOPES} --remote --step 1 --force-consent\`, ` +
        "complete consent once, then `--remote --step 2 --auth-url` with the **full** browser callback URL (not a placeholder). " +
        "If step 2 reports `manual auth state mismatch`, restart at step 1 with a fresh redirect. " +
        "Verify with `gog auth list --check` before retrying Drive/Gmail/Calendar probes.",
      message: "Google Workspace OAuth token is invalid or expired.",
    };
  }
  if (
    lower.includes("http 4") ||
    lower.includes("http 5") ||
    lower.includes("googleapi") ||
    lower.includes("backenderror") ||
    lower.includes("quota")
  ) {
    return {
      state: "provider_api_error",
      missingPrerequisite: null,
      message: "Google Workspace API returned an upstream provider error.",
    };
  }
  return {
    state: "configured_but_unverified",
    missingPrerequisite:
      "Run `gog auth list` and verify the selected account is authorized for gmail/calendar/drive.",
    message: "Google Workspace connector is configured but could not be verified.",
  };
}

function resolveConnectorEnabled(config: OpenClawConfig): {
  enabled: boolean;
  message: string;
  missingPrerequisite: string | null;
} {
  const skillEntry = config.skills?.entries?.gog;
  if (skillEntry?.enabled === false) {
    return {
      enabled: false,
      message:
        "Google Workspace connector is disabled in config (skills.entries.gog.enabled=false).",
      missingPrerequisite: "Set `skills.entries.gog.enabled=true`.",
    };
  }
  const allowBundled = config.skills?.allowBundled;
  if (Array.isArray(allowBundled) && allowBundled.length > 0 && !allowBundled.includes("gog")) {
    return {
      enabled: false,
      message: "Google Workspace connector is blocked by skills.allowBundled.",
      missingPrerequisite: "Add `gog` to `skills.allowBundled` or remove the allowlist.",
    };
  }
  return { enabled: true, message: "connector enabled", missingPrerequisite: null };
}

function countDeltaItems(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 0;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.length;
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      for (const key of ["messages", "threads", "events", "files", "items", "changes"]) {
        const value = record[key];
        if (Array.isArray(value)) {
          return value.length;
        }
      }
      return Object.keys(record).length;
    }
  } catch {
    // fall through to line-based count
  }
  return trimmed
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function toServiceResult(params: {
  service: GoogleWorkspaceService;
  command: string;
  result: SpawnResult;
}): GoogleWorkspaceServiceReadiness {
  const stderrPreview = summarizeText(params.result.stderr);
  const stdoutPreview = summarizeText(params.result.stdout);
  if (params.result.code === 0) {
    return {
      service: params.service,
      state: "configured_and_verified",
      message: `${params.service} delta probe succeeded.`,
      missingPrerequisite: null,
      deltaProbeCommand: params.command,
      deltaProbeExitCode: 0,
      deltaCount: countDeltaItems(params.result.stdout),
      stdoutPreview,
      stderrPreview,
    };
  }
  const combined = [params.result.stderr, params.result.stdout].filter(Boolean).join("\n");
  const classification = classifyProbeFailure(combined);
  return {
    service: params.service,
    state: classification.state,
    message: classification.message,
    missingPrerequisite: classification.missingPrerequisite,
    deltaProbeCommand: params.command,
    deltaProbeExitCode: params.result.code ?? null,
    deltaCount: null,
    stdoutPreview,
    stderrPreview,
  };
}

function buildFixedServiceResult(params: {
  service: GoogleWorkspaceService;
  state: GoogleWorkspaceVerificationState;
  message: string;
  missingPrerequisite: string | null;
}): GoogleWorkspaceServiceReadiness {
  return {
    service: params.service,
    state: params.state,
    message: params.message,
    missingPrerequisite: params.missingPrerequisite,
    deltaProbeCommand: null,
    deltaProbeExitCode: null,
    deltaCount: null,
    stdoutPreview: null,
    stderrPreview: null,
  };
}

function aggregateWorkspaceState(
  services: Record<GoogleWorkspaceService, GoogleWorkspaceServiceReadiness>,
): { state: GoogleWorkspaceVerificationState; message: string } {
  const states = Object.values(services).map((entry) => entry.state);
  if (states.every((state) => state === "configured_and_verified")) {
    return {
      state: "configured_and_verified",
      message: "Google Workspace Gmail/Calendar/Drive delta probes verified.",
    };
  }
  const priority: GoogleWorkspaceVerificationState[] = [
    "connector_disabled",
    "bootstrap_not_run",
    "missing_credentials",
    "missing_required_scopes",
    "token_invalid_or_expired",
    "provider_api_error",
    "configured_but_unverified",
    "unknown_internal_error",
  ];
  for (const state of priority) {
    if (states.includes(state)) {
      return {
        state,
        message: `Google Workspace is not ready: ${state.replace(/_/g, " ")}.`,
      };
    }
  }
  return {
    state: "unknown_internal_error",
    message: "Google Workspace readiness could not be determined.",
  };
}

function resolveProbeAccount(config: OpenClawConfig): string | null {
  const envAccount = process.env.GOG_ACCOUNT?.trim();
  if (envAccount) {
    return envAccount;
  }
  const configAccount = config.hooks?.gmail?.account?.trim();
  return configAccount && configAccount.length > 0 ? configAccount : null;
}

async function runWorkspaceProbe(params: {
  service: GoogleWorkspaceService;
  account: string | null;
  timeoutMs: number;
  runner: GogRunner;
  now: Date;
}): Promise<GoogleWorkspaceServiceReadiness> {
  const env =
    params.account && params.account.length > 0
      ? ({ ...process.env, GOG_ACCOUNT: params.account } as NodeJS.ProcessEnv)
      : undefined;
  const from = new Date(params.now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(params.now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const argv =
    params.service === "gmail"
      ? ["gog", "gmail", "search", "newer_than:1d", "--max", "10"]
      : params.service === "calendar"
        ? ["gog", "calendar", "events", "primary", "--from", from, "--to", to]
        : ["gog", "drive", "search", `modifiedTime > '${from}'`, "--max", "10"];
  const result = await params.runner(argv, { timeoutMs: params.timeoutMs, env });
  return toServiceResult({
    service: params.service,
    command: summarizeCommand(argv),
    result,
  });
}

export async function probeGoogleWorkspaceReadiness(params: {
  config: OpenClawConfig;
  timeoutMs?: number;
  now?: Date;
  hasBinaryFn?: (bin: string) => boolean;
  runCommandFn?: GogRunner;
  skipActiveProbes?: boolean;
}): Promise<GoogleWorkspaceReadinessReport> {
  const checkedAt = new Date().toISOString();
  const timeoutMs = Math.max(1000, params.timeoutMs ?? 5000);
  const now = params.now ?? new Date();
  const hasBinaryFn = params.hasBinaryFn ?? hasBinary;
  const runner = params.runCommandFn ?? runCommandWithTimeout;
  const connector = resolveConnectorEnabled(params.config);
  const account = resolveProbeAccount(params.config);

  const fixedServices = (state: GoogleWorkspaceVerificationState, message: string) =>
    ({
      gmail: buildFixedServiceResult({
        service: "gmail",
        state,
        message,
        missingPrerequisite: connector.missingPrerequisite,
      }),
      calendar: buildFixedServiceResult({
        service: "calendar",
        state,
        message,
        missingPrerequisite: connector.missingPrerequisite,
      }),
      drive: buildFixedServiceResult({
        service: "drive",
        state,
        message,
        missingPrerequisite: connector.missingPrerequisite,
      }),
    }) satisfies Record<GoogleWorkspaceService, GoogleWorkspaceServiceReadiness>;

  if (!connector.enabled) {
    return {
      state: "connector_disabled",
      message: connector.message,
      connectorEnabled: false,
      account,
      checkedAt,
      services: fixedServices("connector_disabled", connector.message),
    };
  }
  if (!hasBinaryFn("gog")) {
    const message = "Google Workspace bootstrap missing: gog binary not found on PATH.";
    const missingPrerequisite =
      "Install gogcli and ensure `gog` is available on PATH before running Workspace deltas.";
    return {
      state: "bootstrap_not_run",
      message,
      connectorEnabled: true,
      account,
      checkedAt,
      services: {
        gmail: buildFixedServiceResult({
          service: "gmail",
          state: "bootstrap_not_run",
          message,
          missingPrerequisite,
        }),
        calendar: buildFixedServiceResult({
          service: "calendar",
          state: "bootstrap_not_run",
          message,
          missingPrerequisite,
        }),
        drive: buildFixedServiceResult({
          service: "drive",
          state: "bootstrap_not_run",
          message,
          missingPrerequisite,
        }),
      },
    };
  }
  if (params.skipActiveProbes === true) {
    const message =
      "Google Workspace connector configured; active verification probes are skipped.";
    return {
      state: "configured_but_unverified",
      message,
      connectorEnabled: true,
      account,
      checkedAt,
      services: fixedServices("configured_but_unverified", message),
    };
  }

  const authProbe = await runner(["gog", "auth", "list", "--json"], {
    timeoutMs,
    env:
      account && account.length > 0
        ? ({ ...process.env, GOG_ACCOUNT: account } as NodeJS.ProcessEnv)
        : undefined,
  });
  if (authProbe.code !== 0) {
    const combined = [authProbe.stderr, authProbe.stdout].filter(Boolean).join("\n");
    const classification = classifyProbeFailure(combined);
    return {
      state: classification.state,
      message: classification.message,
      connectorEnabled: true,
      account,
      checkedAt,
      services: {
        gmail: {
          ...buildFixedServiceResult({
            service: "gmail",
            state: classification.state,
            message: classification.message,
            missingPrerequisite: classification.missingPrerequisite,
          }),
          deltaProbeCommand: "gog auth list --json",
          deltaProbeExitCode: authProbe.code ?? null,
          stdoutPreview: summarizeText(authProbe.stdout),
          stderrPreview: summarizeText(authProbe.stderr),
        },
        calendar: {
          ...buildFixedServiceResult({
            service: "calendar",
            state: classification.state,
            message: classification.message,
            missingPrerequisite: classification.missingPrerequisite,
          }),
          deltaProbeCommand: "gog auth list --json",
          deltaProbeExitCode: authProbe.code ?? null,
          stdoutPreview: summarizeText(authProbe.stdout),
          stderrPreview: summarizeText(authProbe.stderr),
        },
        drive: {
          ...buildFixedServiceResult({
            service: "drive",
            state: classification.state,
            message: classification.message,
            missingPrerequisite: classification.missingPrerequisite,
          }),
          deltaProbeCommand: "gog auth list --json",
          deltaProbeExitCode: authProbe.code ?? null,
          stdoutPreview: summarizeText(authProbe.stdout),
          stderrPreview: summarizeText(authProbe.stderr),
        },
      },
    };
  }

  const [gmail, calendar, drive] = await Promise.all([
    runWorkspaceProbe({
      service: "gmail",
      account,
      timeoutMs,
      runner,
      now,
    }),
    runWorkspaceProbe({
      service: "calendar",
      account,
      timeoutMs,
      runner,
      now,
    }),
    runWorkspaceProbe({
      service: "drive",
      account,
      timeoutMs,
      runner,
      now,
    }),
  ]);

  const services = {
    gmail,
    calendar,
    drive,
  } satisfies Record<GoogleWorkspaceService, GoogleWorkspaceServiceReadiness>;
  const aggregate = aggregateWorkspaceState(services);
  return {
    state: aggregate.state,
    message: aggregate.message,
    connectorEnabled: true,
    account,
    checkedAt,
    services,
  };
}
