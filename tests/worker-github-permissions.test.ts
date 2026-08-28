import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInstallationAccessToken: vi.fn(async () => "installation-token"),
  createActionsLogSource: vi.fn(async () => ({ listJobs: vi.fn(), downloadJobLog: vi.fn() })),
  collectTerraformFailureLog: vi.fn(async () => { throw new Error("GitHub API returned 403"); }),
  runCommand: vi.fn(),
}));

vi.mock("@/lib/github/app", () => ({
  createInstallationAccessToken: mocks.createInstallationAccessToken,
}));
vi.mock("@/lib/github/actions", () => ({
  createActionsLogSource: mocks.createActionsLogSource,
  collectTerraformFailureLog: mocks.collectTerraformFailureLog,
}));
vi.mock("@/worker/command", () => ({ runCommand: mocks.runCommand }));

import { prepareGitHubWorkspace } from "@/worker/github";
import { claimedRun } from "@/tests/phase5-fixtures";

describe("GitHub Actions permission failures", () => {
  it("classifies unavailable Actions logs with a specific worker error", async () => {
    await expect(prepareGitHubWorkspace(claimedRun())).rejects.toMatchObject({
      code: "github_log_unavailable",
    });
    expect(mocks.runCommand).not.toHaveBeenCalled();
  });
});
