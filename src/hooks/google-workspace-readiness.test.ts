import { describe, expect, it, vi } from "vitest";
import { probeGoogleWorkspaceReadiness } from "./google-workspace-readiness.js";

function ok(stdout = "") {
  return {
    stdout,
    stderr: "",
    code: 0,
    signal: null,
    killed: false,
    termination: "exit" as const,
  };
}

function fail(stderr: string) {
  return {
    stdout: "",
    stderr,
    code: 1,
    signal: null,
    killed: false,
    termination: "exit" as const,
  };
}

describe("probeGoogleWorkspaceReadiness", () => {
  it("classifies connector_disabled when gog skill entry is disabled", async () => {
    const runCommandFn = vi.fn();
    const report = await probeGoogleWorkspaceReadiness({
      config: {
        skills: {
          entries: {
            gog: { enabled: false },
          },
        },
      },
      hasBinaryFn: () => true,
      runCommandFn,
    });

    expect(report.state).toBe("connector_disabled");
    expect(report.services.gmail.state).toBe("connector_disabled");
    expect(report.services.calendar.state).toBe("connector_disabled");
    expect(report.services.drive.state).toBe("connector_disabled");
    expect(runCommandFn).not.toHaveBeenCalled();
  });

  it("classifies bootstrap_not_run when gog binary is unavailable", async () => {
    const report = await probeGoogleWorkspaceReadiness({
      config: {},
      hasBinaryFn: () => false,
      runCommandFn: vi.fn(),
    });

    expect(report.state).toBe("bootstrap_not_run");
    expect(report.services.gmail.state).toBe("bootstrap_not_run");
    expect(report.services.gmail.missingPrerequisite).toContain("Install gogcli");
  });

  it("classifies missing credentials from auth bootstrap failure", async () => {
    const runCommandFn = vi.fn(async (argv: string[]) => {
      if (argv[1] === "auth") {
        return fail("credentials missing; run gog auth add");
      }
      return ok();
    });
    const report = await probeGoogleWorkspaceReadiness({
      config: {},
      hasBinaryFn: () => true,
      runCommandFn,
    });

    expect(report.state).toBe("missing_credentials");
    expect(report.services.gmail.state).toBe("missing_credentials");
    expect(report.services.gmail.missingPrerequisite).toContain("gog auth credentials");
    expect(report.message).not.toContain("toolchain isn");
  });

  it("classifies missing scopes from service delta probe", async () => {
    const runCommandFn = vi.fn(async (argv: string[]) => {
      if (argv[1] === "auth") {
        return ok('[{"account":"ops@example.com"}]');
      }
      if (argv[1] === "gmail") {
        return fail("insufficient authentication scopes for gmail");
      }
      return ok("[]");
    });
    const report = await probeGoogleWorkspaceReadiness({
      config: {
        hooks: {
          gmail: {
            account: "ops@example.com",
          },
        },
      },
      hasBinaryFn: () => true,
      runCommandFn,
    });

    expect(report.state).toBe("missing_required_scopes");
    expect(report.services.gmail.state).toBe("missing_required_scopes");
    expect(report.services.gmail.missingPrerequisite).toContain("gog auth add");
    expect(report.services.calendar.state).toBe("configured_and_verified");
    expect(report.services.drive.state).toBe("configured_and_verified");
  });

  it("runs gmail/calendar/drive delta probes when verified", async () => {
    const runCommandFn = vi.fn(async (argv: string[]) => {
      if (argv[1] === "auth") {
        return ok('[{"account":"ops@example.com"}]');
      }
      if (argv[1] === "gmail") {
        return ok('[{"id":"m1"},{"id":"m2"}]');
      }
      if (argv[1] === "calendar") {
        return ok('[{"id":"e1"}]');
      }
      if (argv[1] === "drive") {
        return ok('[{"id":"f1"},{"id":"f2"},{"id":"f3"}]');
      }
      return ok();
    });

    const report = await probeGoogleWorkspaceReadiness({
      config: {
        hooks: {
          gmail: {
            account: "ops@example.com",
          },
        },
      },
      hasBinaryFn: () => true,
      runCommandFn,
    });

    expect(report.state).toBe("configured_and_verified");
    expect(report.services.gmail.deltaCount).toBe(2);
    expect(report.services.calendar.deltaCount).toBe(1);
    expect(report.services.drive.deltaCount).toBe(3);
    const commands = runCommandFn.mock.calls.map((call) => call[0].join(" "));
    expect(commands.some((line) => line.includes("gog gmail search"))).toBe(true);
    expect(commands.some((line) => line.includes("gog calendar events primary"))).toBe(true);
    expect(commands.some((line) => line.includes("gog drive search"))).toBe(true);
  });

  it("classifies expired/invalid token errors explicitly", async () => {
    const runCommandFn = vi.fn(async (argv: string[]) => {
      if (argv[1] === "auth") {
        return fail("invalid_grant: token has expired");
      }
      return ok();
    });
    const report = await probeGoogleWorkspaceReadiness({
      config: {},
      hasBinaryFn: () => true,
      runCommandFn,
    });

    expect(report.state).toBe("token_invalid_or_expired");
    expect(report.services.gmail.state).toBe("token_invalid_or_expired");
    expect(report.services.gmail.missingPrerequisite).toContain("Refresh OAuth tokens");
  });
});
