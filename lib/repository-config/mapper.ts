import type { AgentExecutionConfig, RepositoryConfigInput } from "@/lib/repository-config/types";

interface PersistedRepositoryConfig {
  enabled: boolean;
  terraformDir: string;
  terraformVersion: string;
  modelProvider: "GEMINI";
  model: string;
  contextMode: "AUTO" | "LIGHTWEIGHT" | "SCHEMA_AWARE";
  maxRepairAttempts: number;
  triggerOnPullRequest: boolean;
  triggerOnPush: boolean;
  failedStages: Array<"VALIDATE" | "PLAN">;
  workflowNames: string[];
  workflowNamePatterns: string[];
  terraformPathPatterns: string[];
}

const contextModeFromDatabase = {
  AUTO: "auto",
  LIGHTWEIGHT: "lightweight",
  SCHEMA_AWARE: "schema-aware",
} as const;

export function toRepositoryConfigInput(config: PersistedRepositoryConfig): RepositoryConfigInput {
  return {
    enabled: config.enabled,
    terraformDir: config.terraformDir,
    terraformVersion: config.terraformVersion,
    modelProvider: "gemini",
    model: config.model,
    contextMode: contextModeFromDatabase[config.contextMode],
    maxRepairAttempts: config.maxRepairAttempts === 0 ? 0 : 1,
    triggerOnPullRequest: config.triggerOnPullRequest,
    triggerOnPush: config.triggerOnPush,
    failedStages: config.failedStages.map((stage) => stage.toLowerCase() as "validate" | "plan"),
    workflowNames: [...config.workflowNames],
    workflowNamePatterns: [...config.workflowNamePatterns],
    terraformPathPatterns: [...config.terraformPathPatterns],
  };
}

export function toAgentExecutionConfig(config: RepositoryConfigInput): AgentExecutionConfig {
  return {
    terraform: {
      directory: config.terraformDir,
      version: config.terraformVersion,
      failedStages: [...config.failedStages],
    },
    model: {
      provider: config.modelProvider,
      name: config.model,
      contextMode: config.contextMode,
    },
    repair: { maxAttempts: config.maxRepairAttempts },
    triggers: {
      pullRequest: config.triggerOnPullRequest,
      push: config.triggerOnPush,
      workflowNames: [...config.workflowNames],
      workflowNamePatterns: [...config.workflowNamePatterns],
      terraformPathPatterns: [...config.terraformPathPatterns],
    },
  };
}
