import type { AgentExecutionConfig, RepositoryConfigInput } from "@/lib/repository-config/types";

interface PersistedRepositoryConfig {
  enabled: boolean;
  terraformDir: string;
  terraformVersion: string;
  modelProvider: "GEMINI" | "OPENROUTER";
  model: string;
  modelRouting?: "AUTO" | "FIXED";
  maxModelTier?: "FREE" | "ECONOMY" | "BALANCED" | "PREMIUM";
  fixedModelId?: string | null;
  modelPolicyVersion?: string;
  accessLevelSnapshot?: "FREE" | "PRO" | "ADVANCED";
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
    modelProvider: config.modelProvider.toLowerCase() as "gemini" | "openrouter",
    model: config.model,
    modelRouting: config.modelRouting?.toLowerCase() as "auto" | "fixed" ?? "fixed",
    maxModelTier: config.maxModelTier?.toLowerCase() as "free" | "economy" | "balanced" | "premium" ?? "free",
    fixedModelId: config.fixedModelId === undefined ? config.model : config.fixedModelId,
    modelPolicyVersion: config.modelPolicyVersion ?? "legacy_phase8",
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

export function toAgentExecutionConfig(config: RepositoryConfigInput, options: { accessLevel?: "FREE" | "PRO" | "ADVANCED"; registry?: import("@/lib/model-policy/types").AgentModelRegistryEntry[] } = {}): AgentExecutionConfig {
  return {
    terraform: {
      directory: config.terraformDir,
      version: config.terraformVersion,
      failedStages: [...config.failedStages],
    },
    model: {
      provider: config.modelProvider,
      name: config.model,
      routing: config.modelRouting,
      maxTier: config.maxModelTier,
      fixedModelId: config.fixedModelId,
      policyVersion: config.modelPolicyVersion,
      accessLevel: options.accessLevel ?? "FREE",
      registry: options.registry ?? [],
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
