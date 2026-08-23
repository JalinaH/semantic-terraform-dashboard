import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findRun: vi.fn(),
  findNewer: vi.fn(),
  updateInstallation: vi.fn(),
  fetchHead: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: {
  agentRun: { findFirst: mocks.findRun },
  gitHubInstallation: { update: mocks.updateInstallation },
} }));
vi.mock("@/lib/github/pull-requests", () => ({ fetchPullRequestHead: mocks.fetchHead }));

import { preflightPatchApplication } from "@/lib/patch-application/service";
import { hashVerifiedPatch } from "@/lib/patch-application/eligibility";

const HEAD = "a".repeat(40);
const PATCH = "diff --git a/main.tf b/main.tf\n--- a/main.tf\n+++ b/main.tf\n@@ -1 +1 @@\n-a\n+b\n";

describe("PatchApplication authorization and GitHub preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findNewer.mockResolvedValue(null);
    mocks.updateInstallation.mockResolvedValue({});
  });

  it("returns access denied and never contacts GitHub for an inaccessible run", async () => {
    mocks.findRun.mockResolvedValueOnce(null);
    await expect(preflightPatchApplication("user-a", "run-b")).resolves.toMatchObject({ ok: false, code: "repository_access_denied" });
    expect(mocks.findRun).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ repository: expect.objectContaining({ installation: expect.objectContaining({ userInstallations: { some: { userId: "user-a" } } }) }) }) }));
    expect(mocks.fetchHead).not.toHaveBeenCalled();
  });

  it("blocks before queue creation when the installation token lacks Contents Write", async () => {
    mocks.findRun.mockResolvedValueOnce(run());
    mocks.findRun.mockResolvedValueOnce(null);
    mocks.fetchHead.mockResolvedValueOnce({ contentsPermission: "read", token: "ephemeral", snapshot: head() });
    await expect(preflightPatchApplication("user-a", "run-1")).resolves.toMatchObject({ ok: false, code: "github_contents_write_required" });
    expect(mocks.updateInstallation).toHaveBeenCalledWith({ where: { id: "installation-db" }, data: { contentsPermission: "read" } });
  });

  it("returns a bound same-repository request only for the exact current head", async () => {
    mocks.findRun.mockResolvedValueOnce(run());
    mocks.findRun.mockResolvedValueOnce(null);
    mocks.fetchHead.mockResolvedValueOnce({ contentsPermission: "write", token: "ephemeral", snapshot: head() });
    await expect(preflightPatchApplication("user-a", "run-1")).resolves.toMatchObject({ ok: true, expectedHeadSha: HEAD, patchSha256: hashVerifiedPatch(PATCH), affectedFiles: ["main.tf"] });
  });
});

function run() {
  return {
    id: "run-1", repositoryId: "repo-1", githubInstallationId: "installation-db", pullRequestNumber: 12,
    status: "COMPLETED", verificationStatus: "VERIFIED_FIRST_ATTEMPT", verifiedPatch: PATCH,
    patchSha256: hashVerifiedPatch(PATCH), verifiedAgainstCommitSha: HEAD, patchAffectedFiles: ["main.tf"],
    patchTerraformFilesOnly: true, patchExistingFilesOnly: true, patchRepositoryRelative: true,
    mutationEligible: true, mutationEligibilityReason: "verified_terraform_patch", configSnapshot: { terraformDir: ".", terraformVersion: "1.15.7" },
    createdAt: new Date("2026-08-23T00:00:00Z"), patchApplications: [],
    repository: { id: "repo-1", owner: "acme", name: "infra", fullName: "acme/infra" },
    githubInstallation: { id: "installation-db", installationId: "9001", suspendedAt: null },
  };
}
function head() { return { state: "open", merged: false, draft: false, headSha: HEAD, headBranch: "fix", headRepositoryFullName: "acme/infra", baseRepositoryFullName: "acme/infra", htmlUrl: "https://github.com/acme/infra/pull/12" }; }
