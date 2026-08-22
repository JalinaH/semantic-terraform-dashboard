export type ModelProvider = "gemini" | "openrouter";
export type ModelRouting = "auto" | "fixed";
export type ModelTier = "free" | "economy" | "balanced" | "premium";
export type RepositoryContextMode = "auto" | "lightweight" | "schema-aware";
export type FailureStage = "validate" | "plan";
export type RepositoryConfigStatus = "not_configured" | "configured" | "ready" | "disabled" | "attention";

export interface RepositoryConfigInput {
  enabled: boolean;
  terraformDir: string;
  terraformVersion: string;
  modelProvider: ModelProvider;
  model: string;
  modelRouting: ModelRouting;
  maxModelTier: ModelTier;
  fixedModelId: string | null;
  modelPolicyVersion: string;
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
  accessLevelSnapshot: "FREE" | "PRO" | "ADVANCED";
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
    routing: ModelRouting;
    maxTier: ModelTier;
    fixedModelId: string | null;
    policyVersion: string;
    accessLevel: "FREE" | "PRO" | "ADVANCED";
    registry: import("@/lib/model-policy/types").AgentModelRegistryEntry[];
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
