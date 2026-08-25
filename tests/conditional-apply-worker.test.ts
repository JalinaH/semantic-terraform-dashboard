import { describe, expect, it, vi } from "vitest";
import { hashVerifiedPatch } from "@/lib/patch-application/eligibility";
import type { FreshVerificationSummary } from "@/lib/patch-application/types";
import { enforceFreshVerificationPolicy, processClaimedPatchApplication } from "@/worker/patch-application";

const HEAD = "a".repeat(40);
const COMMIT = "b".repeat(40);
const PATCH = "diff --git a/main.tf b/main.tf\n--- a/main.tf\n+++ b/main.tf\n@@ -1 +1 @@\n-old\n+new\n";

describe("conditional fresh-verification policy", () => {
  it("allows fresh full success or the exact environmental condition approved by the user", () => {
    expect(() => enforceFreshVerificationPolicy(conditionalJob(), summary("fully_verified"))).not.toThrow();
    expect(() => enforceFreshVerificationPolicy(conditionalJob(), summary("environment_blocked", "permissions", "aws_access_denied"))).not.toThrow();
  });

  it.each([
    ["semantic_failure", "terraform_semantic", "invalid_variable_value", "fresh_verification_semantic_failure"],
    ["unknown_failure", "unknown", "unclassified_plan_failure", "fresh_verification_unknown_failure"],
    ["patch_invalid", null, null, "fresh_verification_patch_invalid"],
    ["environment_blocked", "network", "connection_timeout", "conditional_verification_changed"],
  ] as const)("stops %s without silently broadening approval", (outcome, classification, reasonCode, code) => {
    expect(() => enforceFreshVerificationPolicy(conditionalJob(), summary(outcome, classification, reasonCode))).toThrow(expect.objectContaining({ code }));
  });

  it("never downgrades a fully verified request into conditional approval", () => {
    expect(() => enforceFreshVerificationPolicy(verifiedJob(), summary("environment_blocked", "permissions", "aws_access_denied"))).toThrow(expect.objectContaining({ code: "full_verification_regressed" }));
    expect(() => enforceFreshVerificationPolicy(verifiedJob(), summary("semantic_failure", "terraform_semantic", "invalid_variable_value"))).toThrow(expect.objectContaining({ code: "full_verification_regressed" }));
    expect(() => enforceFreshVerificationPolicy(verifiedJob(), summary("fully_verified"))).not.toThrow();
  });

  it("accepts only fresh local success for a locally validated approval", () => {
    expect(() => enforceFreshVerificationPolicy(localJob(), localSummary())).not.toThrow();
    expect(() => enforceFreshVerificationPolicy(localJob(), summary("environment_blocked", "permissions", "aws_access_denied"))).toThrow(expect.objectContaining({ code: "conditional_verification_changed" }));
  });
});

describe("conditional patch worker", () => {
  it("freshly verifies a local approval without AWS or terraform plan", async () => {
    const store = storeMock();
    const command = commandMock("plan_environment");
    const deps = dependencies(store, command, planFailure("permissions", "aws_access_denied"));
    const result = await processClaimedPatchApplication(localJob(), deps);
    expect(result).toMatchObject({ outcome: "applied", commitSha: COMMIT });
    expect(deps.aws.assume).not.toHaveBeenCalled();
    expect(command.mock.calls.some((call) => call[0] === "terraform" && call[1][0] === "plan")).toBe(false);
    expect(store.markApplied).toHaveBeenCalledWith("application-1", expect.objectContaining({ verification: expect.objectContaining({ verificationMode: "local", planRequested: false, outcome: "locally_validated", stages: expect.objectContaining({ plan: expect.objectContaining({ status: "not_run" }) }) }) }));
  });

  it("commits and non-force pushes only after the approved environmental plan block is freshly reclassified", async () => {
    const store = storeMock();
    const command = commandMock("plan_environment");
    const result = await processClaimedPatchApplication(conditionalJob(), dependencies(store, command, planFailure("permissions", "aws_access_denied")));
    expect(result).toMatchObject({ outcome: "applied", commitSha: COMMIT });
    expect(store.markApplied).toHaveBeenCalledOnce();
    expect(command.mock.calls.some((call) => call[0] === "git" && call[1].includes("commit"))).toBe(true);
    expect(command.mock.calls.some((call) => call[0] === "git" && call[1].includes("push") && call[1].includes("--force"))).toBe(false);
    expect(command.mock.calls.filter((call) => call[0] === "terraform").some((call) => ["apply", "destroy", "import", "taint"].includes(call[1][0]))).toBe(false);
  });

  it.each([
    ["terraform_semantic", "invalid_variable_value", "fresh_verification_semantic_failure"],
    ["unknown", "unclassified_plan_failure", "fresh_verification_unknown_failure"],
  ] as const)("stops before commit when fresh plan becomes %s", async (classification, reasonCode, errorCode) => {
    const store = storeMock();
    const command = commandMock("plan_environment");
    const result = await processClaimedPatchApplication(conditionalJob(), dependencies(store, command, planFailure(classification, reasonCode)));
    expect(result).toMatchObject({ outcome: "failed", errorCode });
    expect(command.mock.calls.some((call) => call[0] === "git" && call[1].includes("commit"))).toBe(false);
    expect(command.mock.calls.some((call) => call[0] === "git" && call[1].includes("push"))).toBe(false);
  });
});

function dependencies(store: ReturnType<typeof storeMock>, command: ReturnType<typeof commandMock>, failure: ReturnType<typeof planFailure>) {
  return {
    store,
    github: { inspect: vi.fn(async () => ({ contentsPermission: "write", token: "ephemeral", snapshot: { state: "open" as const, merged: false, draft: false, headSha: HEAD, headBranch: "fix", headRepositoryFullName: "acme/infra", baseRepositoryFullName: "acme/infra", htmlUrl: "https://github.com/acme/infra/pull/12" } })) },
    aws: { assume: vi.fn(async () => ({ accessKeyId: "temporary", secretAccessKey: "temporary-secret", sessionToken: "temporary-session", region: "us-east-1" })) },
    commands: command,
    classifyPlanFailure: vi.fn(async () => failure),
  };
}

function commandMock(mode: "plan_environment") {
  return vi.fn(async (executable: string, args: string[]) => {
    if (executable === "terraform" && args[0] === "version") return ok(JSON.stringify({ terraform_version: "1.15.7" }));
    if (executable === "terraform" && args[0] === "plan" && mode === "plan_environment") return { exitCode: 1, stdout: "", stderr: "AccessDenied", timedOut: false };
    if (executable === "git" && args.includes("--name-status")) return ok("M\0main.tf\0");
    if (executable === "git" && args.includes("--numstat")) return ok("1\t1\tmain.tf\n");
    if (executable === "git" && args.includes("ls-files")) return ok(`100644 ${"c".repeat(40)} 0\tmain.tf\n`);
    if (executable === "git" && args.includes("rev-parse")) return ok(args[0] === "rev-parse" ? COMMIT : HEAD);
    if (executable === "git" && args[0] === "ls-remote") return ok(`${HEAD}\trefs/heads/fix\n`);
    return ok();
  });
}

function conditionalJob() {
  return job({ eligibilityLevel: "conditional", verificationModeAtRequest: "full", planRequestedAtRequest: true, verificationOutcomeAtRequest: "environment_blocked", conditionalApproval: true, conditionalApprovalKind: "environment_conditional", planFailureClassAtRequest: "permissions", planFailureReasonCodeAtRequest: "aws_access_denied" });
}
function verifiedJob() { return job({ eligibilityLevel: "verified", verificationModeAtRequest: "full", planRequestedAtRequest: true, verificationOutcomeAtRequest: "fully_verified", conditionalApproval: false, conditionalApprovalKind: null, planFailureClassAtRequest: null, planFailureReasonCodeAtRequest: null }); }
function localJob() { return job({ eligibilityLevel: "conditional", verificationModeAtRequest: "local", planRequestedAtRequest: false, verificationOutcomeAtRequest: "locally_validated", conditionalApproval: true, conditionalApprovalKind: "local_conditional", planFailureClassAtRequest: null, planFailureReasonCodeAtRequest: null, aws: null }); }
function job(overrides: Record<string, unknown>) {
  return { id: "application-1", agentRunId: "run-1", repositoryId: "repo-1", repositoryOwner: "acme", repositoryName: "infra", repositoryFullName: "acme/infra", repositoryAccessible: true, installationId: "9001", installationActive: true, pullRequestNumber: 12, expectedHeadSha: HEAD, verifiedAgainstCommitSha: HEAD, headBranch: "fix", headRepositoryFullName: "acme/infra", patchSha256: hashVerifiedPatch(PATCH), patch: PATCH, affectedFiles: ["main.tf"], terraformDir: ".", terraformVersion: "1.15.7", requestedByDisplay: "octocat", intendedCommitSha: null, aws: { roleArn: "arn:aws:iam::123456789012:role/TerraFix", externalId: "external", region: "us-east-1", connected: true }, ...overrides } as never;
}

function summary(outcome: FreshVerificationSummary["outcome"], classification: string | null = null, reasonCode: string | null = null): FreshVerificationSummary {
  const passed = { status: "passed" as const, durationMs: 1 };
  return { verificationMode: "full", planRequested: true, stages: { patch_check: passed, patch_apply: passed, fmt: passed, init: passed, validate: passed, plan: { status: outcome === "fully_verified" ? "passed" : outcome === "patch_invalid" ? "not_run" : "failed", durationMs: 1 } }, outcome, applySafety: outcome === "fully_verified" ? "verified" : outcome === "environment_blocked" ? "conditionally_eligible" : "ineligible", planFailure: classification && reasonCode ? planFailure(classification, reasonCode) : null };
}
function localSummary(): FreshVerificationSummary {
  const passed = { status: "passed" as const, durationMs: 1 };
  return { verificationMode: "local", planRequested: false, stages: { patch_check: passed, patch_apply: passed, fmt: passed, init: passed, validate: passed, plan: { status: "not_run", durationMs: null } }, outcome: "locally_validated", applySafety: "conditionally_eligible", planFailure: null };
}

function planFailure(classification: string, reasonCode: string) {
  return { classification, reasonCode, summary: "Bounded reason", detail: "Bounded detail", sourceFile: null, sourceLine: null, resourceAddress: null, diagnosticFormat: "bounded_text" as const } as never;
}
function storeMock() { return { updateProgress: vi.fn(async () => undefined), recordFreshVerification: vi.fn(async () => undefined), recordIntendedCommit: vi.fn(async () => undefined), markApplied: vi.fn(async () => undefined), markError: vi.fn(async () => undefined) }; }
function ok(stdout = "") { return { exitCode: 0, stdout, stderr: "", timedOut: false }; }
