import type { RepositoryConfigInput } from "@/lib/repository-config/types";

export const TERRAFORM_VERSION_OPTIONS = ["1.15.7"] as const;
export const MODEL_PROVIDER_OPTIONS = ["gemini"] as const;
export const MODEL_OPTIONS = ["gemini-3.6-flash"] as const;
export const CONTEXT_MODE_OPTIONS = ["auto", "lightweight", "schema-aware"] as const;
export const FAILURE_STAGE_OPTIONS = ["validate", "plan"] as const;

export const REPOSITORY_CONFIG_DEFAULTS: RepositoryConfigInput = {
  enabled: true,
  terraformDir: ".",
  terraformVersion: "1.15.7",
  modelProvider: "gemini",
  model: "gemini-3.6-flash",
  contextMode: "auto",
  maxRepairAttempts: 1,
  triggerOnPullRequest: true,
  triggerOnPush: true,
  failedStages: ["plan"],
  workflowNames: ["Terraform", "Terraform CI", "Infrastructure Plan"],
  workflowNamePatterns: [],
  terraformPathPatterns: ["**/*.tf", "**/*.tf.json"],
};
