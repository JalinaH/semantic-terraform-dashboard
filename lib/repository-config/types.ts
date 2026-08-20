export type ModelProvider = "gemini";
export type RepositoryContextMode = "auto" | "lightweight" | "schema-aware";
export type FailureStage = "validate" | "plan";
export type RepositoryConfigStatus = "not_configured" | "configured" | "ready" | "disabled";

export interface RepositoryConfigInput {
  enabled: boolean;
  terraformDir: string;
  terraformVersion: string;
  modelProvider: ModelProvider;
  model: string;
  contextMode: RepositoryContextMode;
  maxRepairAttempts: 0 | 1;
  triggerOnPullRequest: boolean;
  triggerOnPush: boolean;
  failedStages: FailureStage[];
  workflowNames: string[];
  workflowNamePatterns: string[];
  terraformPathPatterns: string[];
}

export interface RepositoryConfigRecord extends RepositoryConfigInput {
  id: string;
  repositoryId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentExecutionConfig {
  terraform: {
    directory: string;
    version: string;
    failedStages: FailureStage[];
  };
  model: {
    provider: ModelProvider;
    name: string;
    contextMode: RepositoryContextMode;
  };
  repair: {
    maxAttempts: 0 | 1;
  };
  triggers: {
    pullRequest: boolean;
    push: boolean;
    workflowNames: string[];
    workflowNamePatterns: string[];
    terraformPathPatterns: string[];
  };
}

export interface RepositoryConfigActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<keyof RepositoryConfigInput, string[]>>;
  savedAt?: string;
}
