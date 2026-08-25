import { describe, expect, it } from "vitest";
import { parseAgentResult, sanitizeSuccessfulAgentResult } from "@/lib/agent-result";
import { hashVerifiedPatch } from "@/lib/patch-application/eligibility";
import { evaluateApplyEligibility } from "@/lib/verification-assessment";
import { v1AgentResult } from "@/tests/phase7-fixtures";

const HEAD = "a".repeat(40);
const PATCH = "diff --git a/main.tf b/main.tf\n--- a/main.tf\n+++ b/main.tf\n@@ -1 +1 @@\n-old\n+new\n";

describe("agent v1.1.4 verification assessment", () => {
  it("normalizes a fully verified assessment and verified eligibility", () => {
    const result = sanitize(v114Result());
    expect(result.telemetry).toMatchObject({
      agentVersion: "1.1.4", verificationOutcome: "fully_verified", applySafety: "verified",
      mutationEligibilityLevel: "verified", assessmentPatchCheckPassed: true,
      assessmentPlanAttempted: true, assessmentPlanPassed: true, assessmentFullVerificationPassed: true,
      planFailureClass: null,
    });
    expect(result.safeResultPayload).toHaveProperty("verificationAssessment.outcome", "fully_verified");
  });

  it.each([
    ["credentials", "aws_no_credentials"],
    ["permissions", "aws_access_denied"],
    ["network", "connection_timeout"],
  ] as const)("normalizes a bounded %s environment block", (classification, reasonCode) => {
    const result = sanitize(v114Result(environmentAssessment(classification, reasonCode)));
    expect(result.telemetry).toMatchObject({
      verificationOutcome: "environment_blocked", applySafety: "conditionally_eligible",
      mutationEligible: true, mutationEligibilityLevel: "conditional",
      planFailureClass: classification, planFailureReasonCode: reasonCode,
      assessmentPlanAttempted: true, assessmentPlanPassed: false,
    });
    expect(result.telemetry.planFailureDetail).not.toContain(`AKIA${"Z".repeat(16)}`);
  });

  it.each([
    ["semantic_failure", "terraform_semantic", "invalid_variable_value"],
    ["unknown_failure", "unknown", "unclassified_plan_failure"],
  ] as const)("keeps %s ineligible", (outcome, classification, reasonCode) => {
    const result = sanitize(v114Result({
      verification_assessment: assessment(outcome, "ineligible", classification, reasonCode),
      mutation_eligibility: { eligible: false, eligibility_level: "ineligible", reason_code: "verification_failed", reasons: [], requires_fresh_head_check: true },
    }));
    expect(result.telemetry).toMatchObject({ verificationOutcome: outcome, applySafety: "ineligible", mutationEligible: false, mutationEligibilityLevel: "ineligible", planFailureClass: classification });
  });

  it("keeps v1.1.0-v1.1.3 style results valid without inventing conditional assessment", () => {
    const result = sanitize(v114Result({ agent_version: "1.1.3", verification_assessment: undefined }));
    expect(result.telemetry.verificationOutcome).toBeNull();
    expect(result.telemetry.applySafety).toBeNull();
  });
});

describe("agent v1.2.0 local verification assessment", () => {
  it("normalizes local success without inventing plan or environment failure", () => {
    const base = v114Result() as Record<string, unknown>;
    const diagnosis = base.diagnosis as Record<string, unknown>;
    const attempts = diagnosis.attempts as Array<Record<string, unknown>>;
    const result = sanitize(v114Result({
      agent_version: "1.2.0",
      verification_mode: "local",
      plan_requested: false,
      plan_attempted: false,
      plan_skip_reason: "cloud_verification_not_configured",
      diagnosis: {
        ...diagnosis,
        attempts: attempts.map((attempt) => ({ ...attempt, status: "locally_validated", verification_mode: "local", plan_requested: false, plan_skip_reason: "cloud_verification_not_configured", commands: { ...(attempt.commands as object), plan: { command: ["terraform", "plan"], status: "skipped", duration_seconds: 0 } } })),
        verification_status: "locally_validated_first_attempt",
        verification: { passed: true, status: "locally_validated_first_attempt", failed_stage: null, reason: null },
      },
      verified_patch: { ...(base.verified_patch as object), verification_status: "locally_validated_first_attempt", verification_passed: true },
      verification_provenance: { ...(base.verification_provenance as object), final_status: "locally_validated_first_attempt", verification_mode: "local", plan_required: false, plan_requested: false, plan_attempted: false, plan_passed: null, plan_skip_reason: "cloud_verification_not_configured" },
      verification_assessment: { outcome: "locally_validated", verification_mode: "local", plan_requested: false, patch_check_passed: true, patch_apply_passed: true, fmt_passed: true, init_passed: true, validate_passed: true, plan_attempted: false, plan_passed: null, plan_skip_reason: "cloud_verification_not_configured", full_verification_passed: false, apply_safety: "conditionally_eligible", plan_failure: null },
      mutation_eligibility: { eligible: true, eligibility_level: "conditional", reason_code: "locally_validated_terraform_patch", reasons: [], requires_fresh_head_check: true },
    }));
    expect(result.telemetry).toMatchObject({
      agentVersion: "1.2.0",
      verificationOutcome: "locally_validated",
      verificationMode: "local",
      assessmentPlanRequested: false,
      assessmentPlanAttempted: false,
      assessmentPlanPassed: null,
      planSkipReason: "cloud_verification_not_configured",
      planFailureClass: null,
      mutationEligibilityLevel: "conditional",
      mutationEligibilityReason: "locally_validated_terraform_patch",
    });
  });
});

describe("fail-closed Apply combinations", () => {
  const full = fields({ verificationOutcome: "fully_verified", applySafety: "verified", mutationEligibilityLevel: "verified", mutationEligibilityReason: "verified_terraform_patch", assessmentPlanPassed: true, assessmentFullVerificationPassed: true });
  const conditional = fields({ verificationOutcome: "environment_blocked", applySafety: "conditionally_eligible", mutationEligibilityLevel: "conditional", mutationEligibilityReason: "terraform_plan_environment_blocked", assessmentPlanPassed: false, assessmentFullVerificationPassed: false, planFailureClass: "permissions", planFailureReasonCode: "aws_access_denied" });
  const local = fields({ verificationOutcome: "locally_validated", verificationMode: "local", applySafety: "conditionally_eligible", mutationEligibilityLevel: "conditional", mutationEligibilityReason: "locally_validated_terraform_patch", assessmentPlanRequested: false, assessmentPlanAttempted: false, assessmentPlanPassed: null, planSkipReason: "cloud_verification_not_configured", assessmentFullVerificationPassed: false });

  it("accepts only the exact fully verified and conditional conjunctions", () => {
    expect(evaluateApplyEligibility(full)).toBe("verified");
    expect(evaluateApplyEligibility(conditional)).toBe("conditional");
    expect(evaluateApplyEligibility(local)).toBe("conditional");
    expect(evaluateApplyEligibility({ ...conditional, mutationEligible: false })).toBeNull();
    expect(evaluateApplyEligibility({ ...conditional, applySafety: "verified" })).toBeNull();
    expect(evaluateApplyEligibility({ ...conditional, planFailureClass: "terraform_semantic" })).toBeNull();
    expect(evaluateApplyEligibility({ ...conditional, assessmentValidatePassed: false })).toBeNull();
    expect(evaluateApplyEligibility({ ...conditional, verificationOutcome: "unknown_failure" })).toBeNull();
  });
});

function sanitize(value: unknown) {
  const parsed = parseAgentResult(value);
  expect(parsed.success).toBe(true);
  if (!parsed.success || parsed.data.status !== "ok") throw new Error("Expected successful result");
  return sanitizeSuccessfulAgentResult(parsed.data);
}

function v114Result(overrides: Record<string, unknown> = {}) {
  return v1AgentResult({
    agent_version: "1.1.4",
    diagnosis: { ...(v1AgentResult().diagnosis as object), final_patch: PATCH },
    verified_patch: { patch_sha256: hashVerifiedPatch(PATCH), affected_files: ["main.tf"], repository_relative_paths_only: true, terraform_files_only: true, existing_files_only: true, verification_status: "verified_first_attempt", verification_passed: true, verification_attempt: 1, verified_against_commit_sha: HEAD, source_fingerprint_sha256: "b".repeat(64), candidate_source: "llm" },
    source_provenance: { repository_scope: "scope", terraform_dir: ".", git_commit_sha: HEAD, git_tree_sha: "c".repeat(40), caller_source_revision: HEAD, verified_against_commit_sha: HEAD, working_tree_mode: "git_clean", source_fingerprint_sha256: "b".repeat(64) },
    verification_provenance: { attempt_number: 1, final_status: "verified_first_attempt", verified_in_isolated_workspace: true, patch_check_passed: true, patch_apply_passed: true, fmt_passed: true, init_passed: true, validate_passed: true, plan_required: true, plan_attempted: true, plan_passed: true, terraform_version: "1.15.7", provider_versions: {} },
    verification_assessment: { outcome: "fully_verified", patch_check_passed: true, patch_apply_passed: true, fmt_passed: true, init_passed: true, validate_passed: true, plan_attempted: true, plan_passed: true, full_verification_passed: true, apply_safety: "verified", plan_failure: null },
    mutation_eligibility: { eligible: true, eligibility_level: "verified", reason_code: "verified_terraform_patch", reasons: [], requires_fresh_head_check: true },
    ...overrides,
  });
}

function environmentAssessment(classification: string, reasonCode: string) {
  return {
    diagnosis: { ...(v1AgentResult().diagnosis as object), final_patch: PATCH, verification_status: "verification_unavailable", verification: { passed: false, status: "verification_unavailable", failed_stage: "plan", reason: "Plan blocked" } },
    verified_patch: { patch_sha256: hashVerifiedPatch(PATCH), affected_files: ["main.tf"], repository_relative_paths_only: true, terraform_files_only: true, existing_files_only: true, verification_status: "verification_unavailable", verification_passed: false, verification_attempt: 1, verified_against_commit_sha: HEAD, source_fingerprint_sha256: "b".repeat(64), candidate_source: "llm" },
    verification_assessment: assessment("environment_blocked", "conditionally_eligible", classification, reasonCode),
    mutation_eligibility: { eligible: true, eligibility_level: "conditional", reason_code: "terraform_plan_environment_blocked", reasons: [], requires_fresh_head_check: true },
  };
}

function assessment(outcome: string, applySafety: string, classification: string, reasonCode: string) {
  return { outcome, patch_check_passed: true, patch_apply_passed: true, fmt_passed: true, init_passed: true, validate_passed: true, plan_attempted: true, plan_passed: false, full_verification_passed: false, apply_safety: applySafety, plan_failure: { classification, reason_code: reasonCode, summary: "The assumed TerraFix role is not authorized.", detail: `AccessDenied AKIA${"Z".repeat(16)}`, source_file: "main.tf", source_line: 4, resource_address: "aws_s3_bucket.example", diagnostic_format: "terraform_json" } };
}

function fields(overrides: Record<string, unknown>) {
  return { mutationEligible: true, mutationEligibilityLevel: "verified", mutationEligibilityReason: "verified_terraform_patch", verificationOutcome: "fully_verified", assessmentPatchCheckPassed: true, assessmentPatchApplyPassed: true, assessmentFmtPassed: true, assessmentInitPassed: true, assessmentValidatePassed: true, assessmentPlanAttempted: true, assessmentPlanPassed: true, assessmentFullVerificationPassed: true, applySafety: "verified", planFailureClass: null, planFailureReasonCode: null, ...overrides } as Parameters<typeof evaluateApplyEligibility>[0];
}
