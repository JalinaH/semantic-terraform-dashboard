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

  it("offers a warning-styled conditional action only for the exact environment-blocked contract", () => {
    const html = renderToStaticMarkup(<ApplyVerifiedPatch run={run(conditional())} />);
    expect(html).toContain("Patch validated, full plan blocked");
    expect(html).toContain("Apply validated patch");
    expect(html).toContain("This patch has not passed a complete Terraform plan");
    expect(html).toContain("AWS / provider permissions");
  });

  it.each(["semantic_failure", "unknown_failure"] as const)("fails closed for %s", (verificationOutcome) => {
    const html = renderToStaticMarkup(<ApplyVerifiedPatch run={run({ ...conditional(), verificationOutcome, applySafety: "ineligible", mutationEligible: false, mutationEligibilityLevel: "ineligible" })} />);
    expect(html).toContain("Apply unavailable");
    expect(html).not.toContain("Apply validated patch");
  });

  it("renders applied audit provenance and commit links", () => {
    const html = renderToStaticMarkup(<ApplyVerifiedPatch run={run({ patchApplications: [{
      id: "application-1", status: "applied", stage: "completed", requestedBy: "octocat", requestedAt: "2026-08-23T00:00:00.000Z", completedAt: "2026-08-23T00:02:00.000Z",
      patchSha256: HASH, verifiedAgainstCommitSha: HEAD, expectedHeadSha: HEAD, headBranch: "fix", affectedFiles: ["main.tf"], commitSha: "c".repeat(40),
      commitUrl: `https://github.com/acme/infra/commit/${"c".repeat(40)}`, pullRequestUrl: "https://github.com/acme/infra/pull/12", errorCode: null, errorMessage: null,
      eligibilityLevel: "verified", verificationOutcomeAtRequest: "fully_verified", conditionalApproval: false, planFailureClassAtRequest: null, planFailureReasonCodeAtRequest: null,
      freshVerification: { stages: { plan: { status: "passed", durationMs: 10 } }, outcome: "fully_verified", applySafety: "verified", planFailure: null },
    }] })} />);
    expect(html).toContain("Verified fix applied");
    expect(html).toContain("octocat");
    expect(html).toContain("View commit");
    expect(html).toContain("View pull request");
  });
});

function run(overrides: Record<string, unknown> = {}) {
  return { id: "run-1", repositoryFullName: "acme/infra", pullRequestNumber: 12, branch: "fix", verificationStatus: "verified_first_attempt" as const,
    mutationEligible: true, mutationEligibilityLevel: null, mutationEligibilityReason: "verified_terraform_patch", verificationOutcome: null,
    assessmentPatchCheckPassed: null, assessmentPatchApplyPassed: null, assessmentFmtPassed: null, assessmentInitPassed: null,
    assessmentValidatePassed: null, assessmentPlanAttempted: null, assessmentPlanPassed: null, assessmentFullVerificationPassed: null,
    applySafety: null, planFailure: null, patchSha256: HASH, verifiedAgainstCommitSha: HEAD, patchAffectedFiles: ["main.tf"], patchApplications: [], ...overrides } as never;
}

function conditional() {
  return { verificationStatus: "verification_unavailable", mutationEligible: true, mutationEligibilityLevel: "conditional", mutationEligibilityReason: "terraform_plan_environment_blocked", verificationOutcome: "environment_blocked", assessmentPatchCheckPassed: true, assessmentPatchApplyPassed: true, assessmentFmtPassed: true, assessmentInitPassed: true, assessmentValidatePassed: true, assessmentPlanAttempted: true, assessmentPlanPassed: false, assessmentFullVerificationPassed: false, applySafety: "conditionally_eligible", planFailure: { classification: "permissions", reasonCode: "aws_access_denied", summary: "The assumed TerraFix role is not authorized.", detail: "Access denied" } };
}
