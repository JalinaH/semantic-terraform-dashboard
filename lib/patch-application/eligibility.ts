import { createHash } from "node:crypto";
import path from "node:path";
import type { PatchApplicationErrorCode } from "@/lib/patch-application/types";
import type { PullRequestHeadSnapshot } from "@/lib/patch-application/types";
import { evaluateApplyEligibility, type ApplySafety, type MutationEligibilityLevel, type PlanFailureClass, type VerificationOutcome } from "@/lib/verification-assessment";

const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const PATCH_HASH_PATTERN = /^[0-9a-f]{64}$/;

export interface StoredPatchArtifact {
  status: string;
  verificationStatus: string;
  pullRequestNumber: number | null;
  verifiedPatch: string | null;
  patchSha256: string | null;
  verifiedAgainstCommitSha: string | null;
  patchAffectedFiles: unknown;
  patchTerraformFilesOnly: boolean | null;
  patchExistingFilesOnly: boolean | null;
  patchRepositoryRelative: boolean | null;
  mutationEligible: boolean | null;
  mutationEligibilityLevel: string | null;
  mutationEligibilityReason: string | null;
  verificationOutcome: string | null;
  verificationMode?: string | null;
  assessmentPatchCheckPassed: boolean | null;
  assessmentPatchApplyPassed: boolean | null;
  assessmentFmtPassed: boolean | null;
  assessmentInitPassed: boolean | null;
  assessmentValidatePassed: boolean | null;
  assessmentPlanAttempted: boolean | null;
  assessmentPlanRequested?: boolean | null;
  assessmentPlanPassed: boolean | null;
  planSkipReason?: string | null;
  assessmentFullVerificationPassed: boolean | null;
  applySafety: string | null;
  planFailureClass: string | null;
  planFailureReasonCode: string | null;
}

export function hashVerifiedPatch(patch: string) {
  return createHash("sha256").update(Buffer.from(patch, "utf8")).digest("hex");
}

export function parseAffectedFiles(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;
  const files = value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 1_000);
  return files.length === value.length ? files : null;
}

export function validateStoredPatchArtifact(run: StoredPatchArtifact): { ok: true; patch: string; patchSha256: string; verifiedSha: string; affectedFiles: string[]; eligibilityLevel: "verified" | "conditional"; verificationOutcome: VerificationOutcome | null; verificationMode: "local" | "full"; planRequested: boolean; planFailureClass: PlanFailureClass | null; planFailureReasonCode: string | null } | { ok: false; code: PatchApplicationErrorCode } {
  if (run.mutationEligible === null || run.mutationEligibilityReason === null) return { ok: false, code: "legacy_run" };
  const legacyVerified = run.verificationOutcome === null && run.mutationEligibilityLevel === null && run.applySafety === null
    && run.mutationEligible === true && run.mutationEligibilityReason === "verified_terraform_patch"
    && (run.verificationStatus === "VERIFIED_FIRST_ATTEMPT" || run.verificationStatus === "VERIFIED_AFTER_RETRY");
  const assessedEligibility = evaluateApplyEligibility({
    mutationEligible: run.mutationEligible,
    mutationEligibilityLevel: run.mutationEligibilityLevel as MutationEligibilityLevel,
    mutationEligibilityReason: run.mutationEligibilityReason,
    verificationOutcome: run.verificationOutcome as VerificationOutcome,
    verificationMode: run.verificationMode as "local" | "full" | null,
    assessmentPatchCheckPassed: run.assessmentPatchCheckPassed,
    assessmentPatchApplyPassed: run.assessmentPatchApplyPassed,
    assessmentFmtPassed: run.assessmentFmtPassed,
    assessmentInitPassed: run.assessmentInitPassed,
    assessmentValidatePassed: run.assessmentValidatePassed,
    assessmentPlanAttempted: run.assessmentPlanAttempted,
    assessmentPlanRequested: run.assessmentPlanRequested,
    assessmentPlanPassed: run.assessmentPlanPassed,
    planSkipReason: run.planSkipReason,
    assessmentFullVerificationPassed: run.assessmentFullVerificationPassed,
    applySafety: run.applySafety as ApplySafety,
    planFailureClass: run.planFailureClass as PlanFailureClass | null,
    planFailureReasonCode: run.planFailureReasonCode,
  });
  const eligibilityLevel = assessedEligibility ?? (legacyVerified ? "verified" : null);
  if (run.status !== "COMPLETED" || eligibilityLevel === null) return { ok: false, code: "not_mutation_eligible" };
  if (eligibilityLevel === "verified" && run.verificationStatus !== "VERIFIED_FIRST_ATTEMPT" && run.verificationStatus !== "VERIFIED_AFTER_RETRY") return { ok: false, code: "not_mutation_eligible" };
  if (run.verificationOutcome === "locally_validated" && run.verificationStatus !== "LOCALLY_VALIDATED_FIRST_ATTEMPT" && run.verificationStatus !== "LOCALLY_VALIDATED_AFTER_RETRY") return { ok: false, code: "not_mutation_eligible" };
  if (run.pullRequestNumber === null || !run.verifiedPatch || !run.patchSha256 || !run.verifiedAgainstCommitSha) return { ok: false, code: "legacy_run" };
  if (!PATCH_HASH_PATTERN.test(run.patchSha256) || hashVerifiedPatch(run.verifiedPatch) !== run.patchSha256) return { ok: false, code: "patch_hash_mismatch" };
  if (!SHA_PATTERN.test(run.verifiedAgainstCommitSha)) return { ok: false, code: "source_revision_mismatch" };
  const affectedFiles = parseAffectedFiles(run.patchAffectedFiles);
  if (!affectedFiles || run.patchTerraformFilesOnly !== true || run.patchExistingFilesOnly !== true || run.patchRepositoryRelative !== true) return { ok: false, code: "not_mutation_eligible" };
  const verificationMode = run.verificationOutcome === "locally_validated" ? "local" : "full";
  return { ok: true, patch: run.verifiedPatch, patchSha256: run.patchSha256, verifiedSha: run.verifiedAgainstCommitSha, affectedFiles, eligibilityLevel, verificationOutcome: run.verificationOutcome as VerificationOutcome | null, verificationMode, planRequested: verificationMode === "full", planFailureClass: run.planFailureClass as PlanFailureClass | null, planFailureReasonCode: run.planFailureReasonCode };
}

export function validateTerraformAffectedFiles(files: string[], terraformDir: string) {
  const root = path.posix.normalize(terraformDir.replaceAll("\\", "/")).replace(/^\.\/$/, ".");
  if (path.posix.isAbsolute(root) || root === ".." || root.startsWith("../")) return false;
  return files.length > 0 && files.every((file) => {
    const normalized = path.posix.normalize(file.replaceAll("\\", "/"));
    if (path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) return false;
    const extensionOk = normalized.endsWith(".tf") || normalized.endsWith(".tf.json");
    const inDirectory = root === "." || normalized === root || normalized.startsWith(`${root}/`);
    return extensionOk && inDirectory;
  });
}

export function validatePullRequestPreflight(input: {
  repositoryFullName: string;
  expectedHeadSha: string;
  expectedHeadBranch?: string;
  contentsPermission: string | null;
  head: PullRequestHeadSnapshot;
}): PatchApplicationErrorCode | null {
  if (input.contentsPermission !== "write") return "github_contents_write_required";
  if (input.head.state !== "open" || input.head.merged) return "pull_request_closed";
  const repository = input.repositoryFullName.toLowerCase();
  if (!input.head.headRepositoryFullName || input.head.headRepositoryFullName.toLowerCase() !== repository || input.head.baseRepositoryFullName.toLowerCase() !== repository) return "fork_pull_request";
  if (input.head.headSha !== input.expectedHeadSha.toLowerCase() || (input.expectedHeadBranch && input.head.headBranch !== input.expectedHeadBranch)) return "stale_pull_request";
  return null;
}

export function patchApplicationMessage(code: PatchApplicationErrorCode) {
  return ({
    legacy_run: "This diagnosis predates TerraFix verified-patch provenance. Run TerraFix again to enable Apply to PR.",
    not_mutation_eligible: "This candidate is not eligible for application.",
    patch_hash_mismatch: "The stored patch no longer matches its verified fingerprint.",
    github_contents_write_required: "GitHub Contents: Write permission is required. Approve the TerraFix App permission upgrade, then try again.",
    fork_pull_request: "TerraFix cannot apply patches to fork pull requests.",
    pull_request_closed: "Apply is unavailable because this pull request is closed or merged.",
    source_revision_mismatch: "The verified source revision is invalid or inconsistent.",
    stale_pull_request: "The pull request changed after this patch was verified. Run TerraFix again on the current head.",
    superseded_run: "A newer TerraFix diagnosis supersedes this patch.",
    application_already_exists: "This exact verified patch is already queued or applied.",
    installation_unavailable: "The GitHub App installation is suspended, removed, or inaccessible.",
    repository_access_denied: "You no longer have TerraFix access to this repository.",
    patch_check_failed: "The verified patch no longer applies cleanly to the exact source revision.",
    unexpected_file_change: "Applying the patch changed files outside its verified scope.",
    fresh_verification_failed: "Fresh Terraform verification failed. No commit was pushed.",
    fresh_verification_semantic_failure: "Fresh Terraform verification found a configuration problem. No commit was pushed.",
    fresh_verification_unknown_failure: "Fresh Terraform verification failed for an unclassified reason. TerraFix stopped without pushing.",
    fresh_verification_patch_invalid: "Fresh verification found that the patch is invalid. No commit was pushed.",
    conditional_verification_changed: "The fresh environmental failure no longer matches the condition you approved. No commit was pushed.",
    full_verification_regressed: "The fully verified result regressed during fresh verification. Review the new result before applying.",
    terraform_version_unavailable: "The exact Terraform version used for the diagnosis is unavailable.",
    push_rejected: "GitHub rejected the non-force push. The branch may have moved or be protected.",
    worker_timeout: "The patch application exceeded its bounded worker deadline.",
  } satisfies Record<PatchApplicationErrorCode, string>)[code];
}
