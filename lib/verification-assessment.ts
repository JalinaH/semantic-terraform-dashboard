export const verificationOutcomes = [
  "fully_verified",
  "locally_validated",
  "environment_blocked",
  "semantic_failure",
  "patch_invalid",
  "unknown_failure",
] as const;

export const applySafetyValues = ["verified", "conditionally_eligible", "ineligible"] as const;
export const mutationEligibilityLevels = ["verified", "conditional", "ineligible"] as const;
export const planFailureClasses = [
  "terraform_semantic",
  "credentials",
  "permissions",
  "network",
  "provider_unavailable",
  "external_service",
  "runtime_environment",
  "unknown",
] as const;

export type VerificationOutcome = typeof verificationOutcomes[number];
export type ApplySafety = typeof applySafetyValues[number];
export type MutationEligibilityLevel = typeof mutationEligibilityLevels[number];
export type PlanFailureClass = typeof planFailureClasses[number];
export type ApplyEligibilityKind = "verified" | "conditional";

export interface VerificationAssessmentFields {
  verificationOutcome: VerificationOutcome | null;
  verificationMode?: "local" | "full" | null;
  assessmentPatchCheckPassed: boolean | null;
  assessmentPatchApplyPassed: boolean | null;
  assessmentFmtPassed: boolean | null;
  assessmentInitPassed: boolean | null;
  assessmentValidatePassed: boolean | null;
  assessmentPlanAttempted: boolean | null;
  assessmentPlanRequested?: boolean | null;
  assessmentPlanPassed: boolean | null;
  assessmentFullVerificationPassed: boolean | null;
  applySafety: ApplySafety | null;
  planFailureClass: PlanFailureClass | null;
  planFailureReasonCode: string | null;
  planSkipReason?: string | null;
}

export interface MutationEligibilityFields extends VerificationAssessmentFields {
  mutationEligible: boolean | null;
  mutationEligibilityLevel: MutationEligibilityLevel | null;
  mutationEligibilityReason: string | null;
}

const ENVIRONMENTAL_CLASSES = new Set<PlanFailureClass>([
  "credentials",
  "permissions",
  "network",
  "provider_unavailable",
  "external_service",
  "runtime_environment",
]);

export function isEnvironmentalPlanFailureClass(value: string | null): value is PlanFailureClass {
  return value !== null && ENVIRONMENTAL_CLASSES.has(value as PlanFailureClass);
}

export function evaluateApplyEligibility(input: MutationEligibilityFields): ApplyEligibilityKind | null {
  if (input.mutationEligible !== true) return null;
  const prePlanPassed = input.assessmentPatchCheckPassed === true
    && input.assessmentPatchApplyPassed === true
    && input.assessmentFmtPassed === true
    && input.assessmentInitPassed === true
    && input.assessmentValidatePassed === true;
  if (
    input.mutationEligibilityLevel === "conditional"
    && input.mutationEligibilityReason === "locally_validated_terraform_patch"
    && input.verificationOutcome === "locally_validated"
    && input.verificationMode === "local"
    && input.applySafety === "conditionally_eligible"
    && prePlanPassed
    && input.assessmentPlanRequested === false
    && input.assessmentPlanAttempted === false
    && input.assessmentPlanPassed === null
    && input.assessmentFullVerificationPassed === false
    && input.planSkipReason === "cloud_verification_not_configured"
    && input.planFailureClass === null
    && input.planFailureReasonCode === null
  ) return "conditional";
  if (
    input.mutationEligibilityLevel === "verified"
    && input.mutationEligibilityReason === "verified_terraform_patch"
    && input.verificationOutcome === "fully_verified"
    && input.applySafety === "verified"
    && prePlanPassed
    && input.assessmentPlanAttempted === true
    && input.assessmentPlanPassed === true
    && input.assessmentFullVerificationPassed === true
    && input.planFailureClass === null
  ) return "verified";
  if (
    input.mutationEligibilityLevel === "conditional"
    && input.mutationEligibilityReason === "terraform_plan_environment_blocked"
    && input.verificationOutcome === "environment_blocked"
    && input.applySafety === "conditionally_eligible"
    && prePlanPassed
    && input.assessmentPlanAttempted === true
    && input.assessmentPlanPassed === false
    && input.assessmentFullVerificationPassed === false
    && isEnvironmentalPlanFailureClass(input.planFailureClass)
    && Boolean(input.planFailureReasonCode)
  ) return "conditional";
  return null;
}

export function planFailureClassLabel(value: string | null) {
  return ({
    credentials: "Credentials",
    permissions: "AWS / provider permissions",
    network: "Network",
    provider_unavailable: "Provider unavailable",
    external_service: "External service",
    runtime_environment: "Runtime environment",
    terraform_semantic: "Terraform configuration",
    unknown: "Unknown",
  } as Record<string, string>)[value ?? ""] ?? "Not reported";
}

export function verificationOutcomeLabel(value: VerificationOutcome | null) {
  if (value === null) return "LEGACY VERIFICATION";
  return ({
    fully_verified: "FULLY VERIFIED",
    locally_validated: "LOCALLY VALIDATED",
    environment_blocked: "ENVIRONMENT BLOCKED",
    semantic_failure: "SEMANTIC FAILURE",
    patch_invalid: "PATCH REJECTED",
    unknown_failure: "PLAN FAILURE UNCLASSIFIED",
  } satisfies Record<VerificationOutcome, string>)[value];
}
