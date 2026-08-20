export type VerificationStatus =
  | "verified_first_attempt"
  | "verified_after_retry"
  | "verification_failed"
  | "patch_rejected"
  | "verification_unavailable"
  | "verification_skipped"
  | "pending";

export type VerificationStage = "patch_check" | "patch_apply" | "fmt" | "init" | "validate" | "plan";
export type StageStatus = "passed" | "failed" | "skipped";
export type ContextMode = "minimal" | "smart" | "full";
export type RepositoryStatus = "healthy" | "attention" | "disabled";
export type AWSConnectionStatus = "connected" | "attention" | "not_connected";

export interface VerificationStep {
  name: VerificationStage;
  label: string;
  status: StageStatus;
  detail?: string;
}

export interface Attempt {
  attempt: number;
  title: string;
  summary: string;
  status: "failed" | "verified" | "rejected";
  failureReason?: string;
  steps: VerificationStep[];
}

export interface AgentRun {
  id: string;
  repositoryId: string;
  repositoryFullName: string;
  pullRequestNumber?: number;
  commitSha: string;
  failedStage: string;
  affectedResource: string;
  contextMode: ContextMode;
  verificationStatus: VerificationStatus;
  totalRuntimeMs: number;
  createdAt: string;
  diagnosis: {
    rootCause: string;
    affectedResources: string[];
    violatedConstraint: string;
    modelConfidence: number;
    evidenceScore: number;
  };
  suggestedPatch: string;
  verificationSteps: VerificationStep[];
  attempts: Attempt[];
  performance: {
    collectionMs: number;
    schemaMs: number;
    llmMs: number;
    verificationMs: number;
    totalMs: number;
    inputTokens: number;
    outputTokens: number;
  };
}

export interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  enabled: boolean;
  terraformDir: string;
  terraformVersion: string;
  awsStatus: AWSConnectionStatus;
  awsRegion?: string;
  roleArn?: string;
  model: string;
  contextMode: ContextMode;
  maxRepairAttempts: number;
  lastAnalyzed?: string;
  lastRunStatus?: VerificationStatus;
  status: RepositoryStatus;
}

export interface Metric {
  title: string;
  value: string;
  description: string;
  trend?: string;
}
