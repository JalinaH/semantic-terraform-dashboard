import { describe, expect, it, vi } from "vitest";
import { parseAgentResult, sanitizeSuccessfulAgentResult } from "@/lib/agent-result";
import { hashVerifiedPatch, validatePullRequestPreflight, validateStoredPatchArtifact, validateTerraformAffectedFiles } from "@/lib/patch-application/eligibility";
import { processClaimedPatchApplication } from "@/worker/patch-application";
import { v1AgentResult } from "@/tests/phase7-fixtures";

const HEAD = "a".repeat(40);
const COMMIT = "b".repeat(40);
const PATCH = "diff --git a/main.tf b/main.tf\n--- a/main.tf\n+++ b/main.tf\n@@ -1 +1 @@\n-old\n+new\n";

describe("agent v1.1 verified-patch ingestion", () => {
  it("preserves exact patch bytes and normalizes provenance and eligibility", () => {
    const input = v1AgentResult({
      agent_version: "1.1.4",
      diagnosis: { ...(v1AgentResult().diagnosis as object), final_patch: PATCH },
      verified_patch: {
        patch_sha256: hashVerifiedPatch(PATCH), affected_files: ["main.tf"], repository_relative_paths_only: true,
        terraform_files_only: true, existing_files_only: true, verification_status: "verified_first_attempt",
        verification_passed: true, verification_attempt: 1, verified_against_commit_sha: HEAD,
        source_fingerprint_sha256: "c".repeat(64), candidate_source: "llm",
      },
      source_provenance: {
        repository_scope: "scope", terraform_dir: ".", git_commit_sha: HEAD, git_tree_sha: "d".repeat(40),
        caller_source_revision: HEAD, verified_against_commit_sha: HEAD, working_tree_mode: "git_clean",
        source_fingerprint_sha256: "c".repeat(64),
      },
      verification_provenance: {
        attempt_number: 1, final_status: "verified_first_attempt", verified_in_isolated_workspace: true,
        patch_check_passed: true, patch_apply_passed: true, fmt_passed: true, init_passed: true,
        validate_passed: true, plan_required: true, plan_passed: true, terraform_version: "1.15.7", provider_versions: {},
      },
      mutation_eligibility: { eligible: true, reason_code: "verified_terraform_patch", reasons: [], requires_fresh_head_check: true },
    });
    const parsed = parseAgentResult(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success || parsed.data.status !== "ok") throw new Error("Expected v1.1 result");
    const result = sanitizeSuccessfulAgentResult(parsed.data);
    expect(result.verifiedPatch).toBe(PATCH);
    expect(hashVerifiedPatch(result.verifiedPatch!)).toBe(result.telemetry.patchSha256);
    expect(result.telemetry).toMatchObject({
      agentVersion: "1.1.4", verifiedAgainstCommitSha: HEAD, patchAffectedFiles: ["main.tf"],
      patchTerraformFilesOnly: true, patchExistingFilesOnly: true, patchRepositoryRelative: true,
      mutationEligible: true, mutationEligibilityReason: "verified_terraform_patch",
    });
    expect(result.safeResultPayload).not.toHaveProperty("diagnosis.finalPatch");
  });

  it("keeps a legacy v1.0 artifact ineligible without inventing provenance", () => {
    const parsed = parseAgentResult(v1AgentResult());
    if (!parsed.success || parsed.data.status !== "ok") throw new Error("Expected v1 result");
    const result = sanitizeSuccessfulAgentResult(parsed.data);
    expect(result.verifiedPatch).toBeNull();
    expect(result.telemetry.mutationEligible).toBeNull();
    expect(result.telemetry.patchSha256).toBeNull();
  });
});

describe("stored artifact gates", () => {
  const artifact = () => ({ status: "COMPLETED", verificationStatus: "VERIFIED_FIRST_ATTEMPT", pullRequestNumber: 12,
    verifiedPatch: PATCH, patchSha256: hashVerifiedPatch(PATCH), verifiedAgainstCommitSha: HEAD,
    patchAffectedFiles: ["main.tf"], patchTerraformFilesOnly: true, patchExistingFilesOnly: true,
    patchRepositoryRelative: true, mutationEligible: true, mutationEligibilityLevel: null, mutationEligibilityReason: "verified_terraform_patch",
    verificationOutcome: null, assessmentPatchCheckPassed: null, assessmentPatchApplyPassed: null, assessmentFmtPassed: null,
    assessmentInitPassed: null, assessmentValidatePassed: null, assessmentPlanAttempted: null, assessmentPlanPassed: null,
    assessmentFullVerificationPassed: null, applySafety: null, planFailureClass: null, planFailureReasonCode: null });

  it("distinguishes a legacy artifact and a hash mismatch", () => {
    expect(validateStoredPatchArtifact({ ...artifact(), mutationEligible: null, mutationEligibilityReason: null })).toEqual({ ok: false, code: "legacy_run" });
    expect(validateStoredPatchArtifact({ ...artifact(), verifiedPatch: `${PATCH}\n` })).toEqual({ ok: false, code: "patch_hash_mismatch" });
  });

  it("enforces repository-relative Terraform-only paths", () => {
    expect(validateTerraformAffectedFiles(["modules/app/main.tf", "modules/app/vars.tf.json"], "modules/app")).toBe(true);
    expect(validateTerraformAffectedFiles(["modules/app/main.tf", "README.md"], "modules/app")).toBe(false);
    expect(validateTerraformAffectedFiles(["../main.tf"], ".")).toBe(false);
  });

  it("accepts only internally consistent v1.1.4 verified and conditional artifacts", () => {
    const verified = { ...artifact(), mutationEligibilityLevel: "verified", verificationOutcome: "fully_verified", assessmentPatchCheckPassed: true, assessmentPatchApplyPassed: true, assessmentFmtPassed: true, assessmentInitPassed: true, assessmentValidatePassed: true, assessmentPlanAttempted: true, assessmentPlanPassed: true, assessmentFullVerificationPassed: true, applySafety: "verified" };
    const conditional = { ...verified, verificationStatus: "VERIFICATION_UNAVAILABLE", mutationEligibilityLevel: "conditional", mutationEligibilityReason: "terraform_plan_environment_blocked", verificationOutcome: "environment_blocked", assessmentPlanPassed: false, assessmentFullVerificationPassed: false, applySafety: "conditionally_eligible", planFailureClass: "permissions", planFailureReasonCode: "aws_access_denied" };
    expect(validateStoredPatchArtifact(verified)).toMatchObject({ ok: true, eligibilityLevel: "verified" });
    expect(validateStoredPatchArtifact(conditional)).toMatchObject({ ok: true, eligibilityLevel: "conditional" });
    expect(validateStoredPatchArtifact({ ...conditional, planFailureClass: "terraform_semantic" })).toEqual({ ok: false, code: "not_mutation_eligible" });
    expect(validateStoredPatchArtifact({ ...conditional, mutationEligible: false })).toEqual({ ok: false, code: "not_mutation_eligible" });
  });

  it("rejects missing Contents Write, closed PRs, forks, and stale heads", () => {
    const head = githubHead(HEAD).snapshot;
    const check = (overrides: Record<string, unknown> = {}) => validatePullRequestPreflight({ repositoryFullName: "acme/infra", expectedHeadSha: HEAD, contentsPermission: "write", head, ...overrides });
    expect(check({ contentsPermission: "read" })).toBe("github_contents_write_required");
    expect(check({ head: { ...head, state: "closed" } })).toBe("pull_request_closed");
    expect(check({ head: { ...head, merged: true } })).toBe("pull_request_closed");
    expect(check({ head: { ...head, headRepositoryFullName: "contributor/fork" } })).toBe("fork_pull_request");
    expect(check({ expectedHeadSha: "f".repeat(40) })).toBe("stale_pull_request");
    expect(check({ head: { ...head, draft: true } })).toBeNull();
    expect(check()).toBeNull();
  });
});

describe("deterministic patch application worker", () => {
  it("checks, verifies, commits, and non-force pushes without any LLM dependency", async () => {
    const store = storeMock();
    const commands: Array<{ command: string; args: string[] }> = [];
    const command = vi.fn(async (executable: string, args: string[]) => {
      commands.push({ command: executable, args });
      if (executable === "terraform" && args[0] === "version") return ok(JSON.stringify({ terraform_version: "1.15.7" }));
      if (executable === "git" && args.includes("--name-status")) return ok("M\0main.tf\0");
      if (executable === "git" && args.includes("--numstat")) return ok("1\t1\tmain.tf\n");
      if (executable === "git" && args.includes("ls-files")) return ok(`100644 ${"c".repeat(40)} 0\tmain.tf\n`);
      if (executable === "git" && args.includes("rev-parse")) return ok(args[0] === "rev-parse" ? COMMIT : HEAD);
      if (executable === "git" && args[0] === "ls-remote") return ok(`${HEAD}\trefs/heads/fix\n`);
      return ok();
    });
    const result = await processClaimedPatchApplication(job(), {
      store,
      github: { inspect: vi.fn(async () => githubHead(HEAD)) },
      aws: { assume: vi.fn(async () => ({ accessKeyId: "temporary", secretAccessKey: "temporary-secret", sessionToken: "temporary-session", region: "us-east-1" })) },
      commands: command,
    });
    expect(result).toMatchObject({ outcome: "applied", commitSha: COMMIT });
    expect(store.recordIntendedCommit).toHaveBeenCalledWith("application-1", COMMIT, expect.objectContaining({ stages: expect.objectContaining({ plan: expect.objectContaining({ status: "passed" }) }) }));
    expect(store.markApplied).toHaveBeenCalledOnce();
    expect(commands.some((entry) => entry.command === "git" && entry.args.includes("push") && entry.args.includes("--force"))).toBe(false);
    expect(commands.filter((entry) => entry.command === "terraform").map((entry) => entry.args[0])).toEqual(["version", "fmt", "init", "validate", "plan"]);
    expect(commands.filter((entry) => entry.command === "terraform").some((entry) => ["apply", "destroy", "import", "taint"].includes(entry.args[0]))).toBe(false);
  });

  it("stops before local mutation when the PR head is stale", async () => {
    const store = storeMock();
    const command = vi.fn();
    const result = await processClaimedPatchApplication(job(), {
      store, github: { inspect: vi.fn(async () => githubHead("f".repeat(40))) },
      aws: { assume: vi.fn() }, commands: command,
    });
    expect(result).toMatchObject({ outcome: "failed", errorCode: "stale_pull_request" });
    expect(command).not.toHaveBeenCalled();
    expect(store.markError).toHaveBeenCalledWith("application-1", "stale_pull_request", expect.any(String), "STALE");
  });

  it("reconciles a previously pushed intended commit without creating another", async () => {
    const store = storeMock();
    const command = vi.fn();
    const result = await processClaimedPatchApplication(job({ intendedCommitSha: COMMIT }), {
      store, github: { inspect: vi.fn(async () => githubHead(COMMIT)) }, aws: { assume: vi.fn() }, commands: command,
    });
    expect(result).toEqual({ outcome: "applied", reconciled: true });
    expect(store.markApplied).toHaveBeenCalledWith("application-1", expect.objectContaining({ commitSha: COMMIT }));
    expect(command).not.toHaveBeenCalled();
  });

  it("fails closed when GitHub rejects the non-force push", async () => {
    const store = storeMock();
    const command = vi.fn(async (executable: string, args: string[]) => {
      if (executable === "terraform" && args[0] === "version") return ok(JSON.stringify({ terraform_version: "1.15.7" }));
      if (executable === "git" && args.includes("--name-status")) return ok("M\0main.tf\0");
      if (executable === "git" && args.includes("--numstat")) return ok("1\t1\tmain.tf\n");
      if (executable === "git" && args.includes("ls-files")) return ok(`100644 ${"c".repeat(40)} 0\tmain.tf\n`);
      if (executable === "git" && args.includes("rev-parse")) return ok(args[0] === "rev-parse" ? COMMIT : HEAD);
      if (executable === "git" && args[0] === "ls-remote") return ok(`${HEAD}\trefs/heads/fix\n`);
      if (executable === "git" && args.includes("push")) return { exitCode: 1, stdout: "", stderr: "protected branch", timedOut: false };
      return ok();
    });
    const inspect = vi.fn()
      .mockResolvedValueOnce(githubHead(HEAD))
      .mockResolvedValueOnce(githubHead(HEAD));
    const result = await processClaimedPatchApplication(job(), {
      store,
      github: { inspect },
      aws: { assume: vi.fn(async () => ({ accessKeyId: "temporary", secretAccessKey: "temporary-secret", sessionToken: "temporary-session", region: "us-east-1" })) },
      commands: command,
    });
    expect(result).toMatchObject({ outcome: "failed", errorCode: "push_rejected" });
    expect(store.markApplied).not.toHaveBeenCalled();
    expect(store.markError).toHaveBeenCalledWith("application-1", "push_rejected", expect.any(String), "STALE");
  });

  it("returns uncertain after a successful push and reconciles the intended commit on retry", async () => {
    const store = storeMock();
    store.markApplied.mockRejectedValueOnce(new Error("database unavailable"));
    const command = vi.fn(async (executable: string, args: string[]) => {
      if (executable === "terraform" && args[0] === "version") return ok(JSON.stringify({ terraform_version: "1.15.7" }));
      if (executable === "git" && args.includes("--name-status")) return ok("M\0main.tf\0");
      if (executable === "git" && args.includes("--numstat")) return ok("1\t1\tmain.tf\n");
      if (executable === "git" && args.includes("ls-files")) return ok(`100644 ${"c".repeat(40)} 0\tmain.tf\n`);
      if (executable === "git" && args.includes("rev-parse")) return ok(args[0] === "rev-parse" ? COMMIT : HEAD);
      if (executable === "git" && args[0] === "ls-remote") return ok(`${HEAD}\trefs/heads/fix\n`);
      return ok();
    });
    const first = await processClaimedPatchApplication(job(), {
      store,
      github: { inspect: vi.fn(async () => githubHead(HEAD)) },
      aws: { assume: vi.fn(async () => ({ accessKeyId: "temporary", secretAccessKey: "temporary-secret", sessionToken: "temporary-session", region: "us-east-1" })) },
      commands: command,
    });
    expect(first).toEqual({ outcome: "uncertain", errorCode: "fresh_verification_failed" });
    expect(store.recordIntendedCommit).toHaveBeenCalledWith("application-1", COMMIT, expect.any(Object));
    expect(store.markError).not.toHaveBeenCalled();

    const retryStore = storeMock();
    const retryCommand = vi.fn();
    const second = await processClaimedPatchApplication(job({ intendedCommitSha: COMMIT }), {
      store: retryStore,
      github: { inspect: vi.fn(async () => githubHead(COMMIT)) },
      aws: { assume: vi.fn() },
      commands: retryCommand,
    });
    expect(second).toEqual({ outcome: "applied", reconciled: true });
    expect(retryStore.markApplied).toHaveBeenCalledOnce();
    expect(retryCommand).not.toHaveBeenCalled();
  });
});

function job(overrides: Record<string, unknown> = {}) {
  return { id: "application-1", agentRunId: "run-1", repositoryId: "repo-1", repositoryOwner: "acme", repositoryName: "infra", repositoryFullName: "acme/infra", repositoryAccessible: true,
    installationId: "9001", installationActive: true, pullRequestNumber: 12, expectedHeadSha: HEAD, verifiedAgainstCommitSha: HEAD,
    headBranch: "fix", headRepositoryFullName: "acme/infra", patchSha256: hashVerifiedPatch(PATCH), patch: PATCH, affectedFiles: ["main.tf"], terraformDir: ".", terraformVersion: "1.15.7",
    requestedByDisplay: "octocat", eligibilityLevel: "verified", verificationOutcomeAtRequest: null, conditionalApproval: false,
    planFailureClassAtRequest: null, planFailureReasonCodeAtRequest: null, intendedCommitSha: null,
    aws: { roleArn: "arn:aws:iam::123456789012:role/TerraFix", externalId: "external", region: "us-east-1", connected: true }, ...overrides } as never;
}
function githubHead(sha: string) { return { contentsPermission: "write", token: "ephemeral-token", snapshot: { state: "open", merged: false, draft: false, headSha: sha, headBranch: "fix", headRepositoryFullName: "acme/infra", baseRepositoryFullName: "acme/infra", htmlUrl: "https://github.com/acme/infra/pull/12" } } as const; }
function storeMock() { return { updateProgress: vi.fn(async () => undefined), recordFreshVerification: vi.fn(async () => undefined), recordIntendedCommit: vi.fn(async () => undefined), markApplied: vi.fn(async () => undefined), markError: vi.fn(async () => undefined) }; }
function ok(stdout = "") { return { exitCode: 0, stdout, stderr: "", timedOut: false }; }
