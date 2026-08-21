import type { WorkerErrorCode } from "@/lib/worker/errors";

export type WorkerStage =
  | "queued"
  | "collecting_github_context"
  | "checking_out_repository"
  | "assuming_aws_role"
  | "running_agent"
  | "ingesting_result"
  | "completed"
  | "failed"
  | "skipped";

export interface WorkerConfigSnapshot {
  terraformDir: string;
  terraformVersion: string;
  modelProvider: "gemini";
  model: string;
  contextMode: "auto" | "lightweight" | "schema-aware";
  maxRepairAttempts: 0 | 1;
  failedStages: Array<"validate" | "plan">;
}

export interface ClaimedAgentRun {
  id: string;
  repositoryId: string;
  repositoryOwner: string;
  repositoryName: string;
  repositoryFullName: string;
  repositoryAccessible: boolean;
  installationId: string;
  installationActive: boolean;
  githubRunId: string;
  commitSha: string;
  baseSha: string | null;
  headSha: string | null;
  pullRequestNumber: number | null;
  aws: {
    roleArn: string;
    externalId: string;
    region: string;
    connected: boolean;
  } | null;
  config: WorkerConfigSnapshot;
}

export interface PreparedAgentWorkspace {
  checkoutPath: string;
  failureLogPath: string;
  diffPath: string;
  failedStage: "validate" | "plan" | "unknown";
  cleanup(): Promise<void>;
}

export interface TemporaryAwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: Date;
  region: string;
}

export interface WorkerRunStore {
  markFailed(id: string, code: WorkerErrorCode, message: string): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  updateProgress(id: string, stage: WorkerStage): Promise<void>;
  updateFailedStage(id: string, stage: string): Promise<void>;
  markCompleted(id: string, result: ReturnType<typeof import("@/lib/agent-result").sanitizeSuccessfulAgentResult>): Promise<void>;
}

export interface WorkerDependencies {
  store: WorkerRunStore;
  github: {
    prepare(
      run: ClaimedAgentRun,
      options?: { signal?: AbortSignal; onProgress?(stage: WorkerStage): Promise<void> },
    ): Promise<PreparedAgentWorkspace>;
  };
  aws: { assume(run: ClaimedAgentRun, signal?: AbortSignal): Promise<TemporaryAwsCredentials> };
  agent: {
    invoke(input: {
      run: ClaimedAgentRun;
      workspace: PreparedAgentWorkspace;
      awsCredentials: TemporaryAwsCredentials;
      signal?: AbortSignal;
    }): Promise<unknown>;
  };
}
