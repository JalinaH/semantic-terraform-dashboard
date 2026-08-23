import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/patch-application", () => ({ applyVerifiedPatchAction: vi.fn(async (state) => state) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ApplyVerifiedPatch } from "@/components/apply-verified-patch";

const HEAD = "a".repeat(40);
const HASH = "b".repeat(64);

describe("Apply verified patch UI", () => {
  it("shows Apply to PR only for an eligible verified artifact", () => {
    const html = renderToStaticMarkup(<ApplyVerifiedPatch run={run()} />);
    expect(html).toContain("Verified patch");
    expect(html).toContain("Apply to PR");
    expect(html).toContain("Terraform verification does not establish developer intent");
  });

  it("shows legacy provenance guidance without an Apply button", () => {
    const html = renderToStaticMarkup(<ApplyVerifiedPatch run={run({ mutationEligible: null, mutationEligibilityReason: null, patchSha256: null, verifiedAgainstCommitSha: null })} />);
    expect(html).toContain("predates TerraFix verified-patch provenance");
    expect(html).not.toContain("Apply to PR</button>");
  });

  it("renders applied audit provenance and commit links", () => {
    const html = renderToStaticMarkup(<ApplyVerifiedPatch run={run({ patchApplications: [{
      id: "application-1", status: "applied", stage: "completed", requestedBy: "octocat", requestedAt: "2026-08-23T00:00:00.000Z", completedAt: "2026-08-23T00:02:00.000Z",
      patchSha256: HASH, verifiedAgainstCommitSha: HEAD, expectedHeadSha: HEAD, headBranch: "fix", affectedFiles: ["main.tf"], commitSha: "c".repeat(40),
      commitUrl: `https://github.com/acme/infra/commit/${"c".repeat(40)}`, pullRequestUrl: "https://github.com/acme/infra/pull/12", errorCode: null, errorMessage: null,
      freshVerification: { plan: { status: "passed", durationMs: 10 } },
    }] })} />);
    expect(html).toContain("Verified fix applied");
    expect(html).toContain("octocat");
    expect(html).toContain("View commit");
    expect(html).toContain("View pull request");
  });
});

function run(overrides: Record<string, unknown> = {}) {
  return { id: "run-1", repositoryFullName: "acme/infra", pullRequestNumber: 12, branch: "fix", verificationStatus: "verified_first_attempt" as const,
    mutationEligible: true, mutationEligibilityReason: "verified_terraform_patch", patchSha256: HASH, verifiedAgainstCommitSha: HEAD, patchAffectedFiles: ["main.tf"], patchApplications: [], ...overrides } as never;
}
