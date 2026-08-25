import { describe, expect, it } from "vitest";
import { getRepositoryConfigStatus } from "@/lib/repository-config/status";

describe("repository configuration status", () => {
  it("does not claim readiness before AWS onboarding exists", () => {
    expect(getRepositoryConfigStatus(null)).toBe("not_configured");
    expect(getRepositoryConfigStatus({ enabled: true })).toBe("ready");
    expect(getRepositoryConfigStatus({ enabled: false })).toBe("disabled");
    expect(getRepositoryConfigStatus({ enabled: true }, { status: "CONNECTED" })).toBe("ready");
    expect(getRepositoryConfigStatus({ enabled: true }, { status: "CONNECTED" }, false)).toBe("configured");
    expect(getRepositoryConfigStatus({ enabled: false }, { status: "CONNECTED" })).toBe("disabled");
    expect(getRepositoryConfigStatus({ enabled: true }, { status: "CONNECTED" }, true, false)).toBe("attention");
  });
});
