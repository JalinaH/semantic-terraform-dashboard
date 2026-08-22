import { describe, expect, it } from "vitest";
import { REPOSITORY_CONFIG_DEFAULTS } from "@/lib/repository-config/constants";
import { toAgentExecutionConfig, toRepositoryConfigInput } from "@/lib/repository-config/mapper";

describe("repository configuration mappers", () => {
  it("maps saved configuration to the future agent execution contract", () => {
    expect(toAgentExecutionConfig({
      ...REPOSITORY_CONFIG_DEFAULTS,
      terraformDir: "environments/prod",
      contextMode: "schema-aware",
      failedStages: ["validate", "plan"],
    })).toEqual({
      terraform: {
        directory: "environments/prod",
        version: "1.15.7",
        failedStages: ["validate", "plan"],
      },
      model: {
        provider: "openrouter",
        name: "openrouter/free",
        routing: "auto",
        maxTier: "free",
        fixedModelId: null,
        policyVersion: "terrafix_model_policy_v1",
        accessLevel: "FREE",
        registry: [],
        contextMode: "schema-aware",
      },
      repair: { maxAttempts: 1 },
      triggers: {
        pullRequest: true,
        push: true,
        workflowNames: ["Terraform", "Terraform CI", "Infrastructure Plan"],
        workflowNamePatterns: [],
        terraformPathPatterns: ["**/*.tf", "**/*.tf.json"],
      },
    });
  });

  it("serializes only safe configuration fields for the client", () => {
    const source = {
      enabled: true,
      terraformDir: ".",
      terraformVersion: "1.15.7",
      modelProvider: "GEMINI" as const,
      model: "gemini-3.6-flash",
      modelRouting: "AUTO" as const,
      maxModelTier: "FREE" as const,
      fixedModelId: null,
      modelPolicyVersion: "terrafix_model_policy_v1",
      contextMode: "AUTO" as const,
      maxRepairAttempts: 1,
      triggerOnPullRequest: true,
      triggerOnPush: true,
      failedStages: ["PLAN" as const],
      workflowNames: ["Terraform", "Terraform CI", "Infrastructure Plan"],
      workflowNamePatterns: [],
      terraformPathPatterns: ["**/*.tf", "**/*.tf.json"],
      installationToken: "must-not-leak",
      privateKey: "must-not-leak",
    };
    const serialized = toRepositoryConfigInput(source);
    expect(serialized).toEqual({ ...REPOSITORY_CONFIG_DEFAULTS, modelProvider: "gemini", model: "gemini-3.6-flash" });
    expect(JSON.stringify(serialized)).not.toContain("must-not-leak");
    expect(serialized).not.toHaveProperty("installationToken");
  });
});
