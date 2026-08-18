import { describe, expect, it } from "vitest";
import { getRepositoryConfigStatus } from "@/lib/repository-config/status";

describe("repository configuration status", () => {
  it("does not claim readiness before AWS onboarding exists", () => {
    expect(getRepositoryConfigStatus(null)).toBe("not_configured");
    expect(getRepositoryConfigStatus({ enabled: true })).toBe("configured");
    expect(getRepositoryConfigStatus({ enabled: false })).toBe("disabled");
  });
});
