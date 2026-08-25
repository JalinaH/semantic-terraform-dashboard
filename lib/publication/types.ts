export type PublicationStatus = "pending" | "publishing" | "published" | "failed" | "skipped";

export type VerificationStatus =
  | "verified_first_attempt"
  | "verified_after_retry"
  | "locally_validated_first_attempt"
  | "locally_validated_after_retry"
  | "verification_failed"
  | "patch_rejected"
  | "verification_unavailable"
  | "verification_skipped"
  | "pending";

export interface PublicationCommand {
  status: "passed" | "failed" | "skipped" | "error";
}

export interface PublicationAttempt {
  attempt: number;
  status: "verified" | "locally_validated" | "failed" | "rejected" | "unavailable" | "skipped";
  failedStage?: string | null;
  commands: Record<string, PublicationCommand>;
  failureCategory?: string | null;
  failureReasonCode?: string | null;
  failureDescription?: string | null;
  candidateRepresentation?: string | null;
  planFailure?: import("@/lib/runs/types").PlanFailureView | null;
}

export interface AgentCommentInput {
  runId: string;
  repositoryFullName: string;
  rootCause: string;
  affectedResources: string[];
  violatedConstraint: string | null;
  suggestedPatch: string | null;
  verificationStatus: VerificationStatus;
  modelConfidence: number | null;
  evidenceScore: number | null;
  attempts: PublicationAttempt[];
  llmCallTypes?: string[];
  verificationOutcome?: import("@/lib/verification-assessment").VerificationOutcome | null;
  verificationMode?: "local" | "full" | null;
  planRequested?: boolean | null;
  mutationEligibilityLevel?: import("@/lib/verification-assessment").MutationEligibilityLevel | null;
  planFailure?: import("@/lib/runs/types").PlanFailureView | null;
  dashboardUrl: string | null;
  application?: {
    commitSha: string;
    commitUrl: string | null;
    requestedBy: string | null;
    eligibilityLevel: import("@/lib/verification-assessment").MutationEligibilityLevel | null;
  } | null;
}

export interface RenderedAgentComment {
  body: string;
  redactionWarnings: string[];
  patchTruncated: boolean;
}

export interface PublicationView {
  status: PublicationStatus;
  commentUrl: string | null;
  publishedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  skipReason: string | null;
  attemptCount: number;
}
