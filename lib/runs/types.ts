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
  workerStage: string;
  affectedResource: string | null;
  status: RunStatus;
  verificationStatus: RunVerificationStatus;
  totalRuntimeMs: number | null;
  createdAt: string;
  publicationStatus: import("@/lib/publication/types").PublicationStatus | null;
  displayModel: string | null;
  totalTokens: number | null;
  llmCostUsd: string | null;
  costComplete: boolean | null;
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
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  llmCallCount: number | null;
  llmLatencyMs: number | null;
  llmProvider: string | null;
  requestedModel: string | null;
  reportedModel: string | null;
  upstreamProvider: string | null;
  routingMode: string | null;
  maxModelTier: string | null;
  initialModel: string | null;
  finalModel: string | null;
  initialModelTier: string | null;
  finalModelTier: string | null;
  modelEscalated: boolean | null;
  initialContextLevel: string | null;
  finalContextLevel: string | null;
  contextEscalated: boolean | null;
  contextEscalationReason: string | null;
  schemaRetrieved: boolean | null;
  schemaAvoided: boolean | null;
  sourceCharactersAvailable: number | null;
  sourceCharactersSelected: number | null;
  sourceReductionRatio: number | null;
  schemaCharactersAvailable: number | null;
  schemaCharactersSelected: number | null;
  schemaReductionRatio: number | null;
  failureMemoryStatus: string | null;
  failureMemoryReused: boolean | null;
  freshVerificationPassed: boolean | null;
  resolutionSource: string | null;
  candidateSource: string | null;
  llmCallsAvoided: number | null;
  historicalTokensAvoided: number | null;
  historicalCostAvoidedUsd: string | null;
  agentVersion: string | null;
  llmCalls: LlmCallView[];
  errorCode: string | null;
  errorMessage: string | null;
  skipReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  publication: import("@/lib/publication/types").PublicationView | null;
}

export interface LlmCallView {
  callNumber: number;
  type: string;
  contextLevel: string | null;
  provider: string;
  requestedModel: string;
  reportedModel: string | null;
  upstreamProvider: string | null;
  routingTier: string | null;
  routingReason: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  latencyMs: number;
  cacheHit: boolean | null;
}
