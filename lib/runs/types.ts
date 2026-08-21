export type RunStatus = "queued" | "running" | "completed" | "failed" | "skipped" | "cancelled";

export type RunVerificationStatus =
  | "verified_first_attempt"
  | "verified_after_retry"
  | "verification_failed"
  | "patch_rejected"
  | "verification_unavailable"
  | "verification_skipped"
  | "pending";

export interface RunListItem {
  id: string;
  repositoryId: string;
  repositoryFullName: string;
  pullRequestNumber: number | null;
  commitSha: string;
  failedStage: string | null;
  affectedResource: string | null;
  status: RunStatus;
  verificationStatus: RunVerificationStatus;
  totalRuntimeMs: number | null;
  createdAt: string;
  publicationStatus: import("@/lib/publication/types").PublicationStatus | null;
}

export interface RunCommandView {
  status: "passed" | "failed" | "skipped" | "error";
  durationMs: number;
  exitCode: number | null;
}

export interface RunAttemptView {
  attempt: number;
  status: "verified" | "failed" | "rejected" | "unavailable" | "skipped";
  failedStage: string | null;
  commands: Partial<Record<"patch_check" | "patch_apply" | "fmt" | "init" | "validate" | "plan", RunCommandView>>;
}

export interface RunDetail extends RunListItem {
  githubWorkflowName: string | null;
  branch: string | null;
  contextMode: string;
  model: string;
  rootCause: string | null;
  violatedConstraint: string | null;
  suggestedPatch: string | null;
  affectedResources: string[];
  modelConfidence: number | null;
  evidenceScore: number | null;
  attempts: RunAttemptView[];
  timing: Record<string, number>;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  skipReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  publication: import("@/lib/publication/types").PublicationView | null;
}
