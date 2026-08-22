import { describe, expect, it } from "vitest";
import { REPOSITORY_CONFIG_DEFAULTS } from "@/lib/repository-config/constants";
import { repositoryConfigSchema } from "@/lib/validation/repository-config";

describe("repository configuration validation", () => {
  it("accepts and normalizes a valid repository configuration", () => {
    const result = repositoryConfigSchema.parse({
      ...REPOSITORY_CONFIG_DEFAULTS,
      terraformDir: "terraform//./environments/prod",
      failedStages: ["validate", "plan"],
    });
    expect(result.terraformDir).toBe("terraform/environments/prod");
    expect(result.maxRepairAttempts).toBe(1);
  });

  it.each(["../infra", "infra/../production", "../../etc"])("rejects directory traversal: %s", (terraformDir) => {
    expect(repositoryConfigSchema.safeParse({ ...REPOSITORY_CONFIG_DEFAULTS, terraformDir }).success).toBe(false);
  });

  it.each(["/infra", "C:\\infra"])("rejects an absolute path: %s", (terraformDir) => {
    expect(repositoryConfigSchema.safeParse({ ...REPOSITORY_CONFIG_DEFAULTS, terraformDir }).success).toBe(false);
  });

  it("rejects null bytes and malformed path characters", () => {
    expect(repositoryConfigSchema.safeParse({ ...REPOSITORY_CONFIG_DEFAULTS, terraformDir: "infra\0prod" }).success).toBe(false);
    expect(repositoryConfigSchema.safeParse({ ...REPOSITORY_CONFIG_DEFAULTS, terraformDir: "infra/$prod" }).success).toBe(false);
  });

  it.each(["1.15", "v1.15.7", "1.15.7-beta"])("rejects a malformed Terraform version: %s", (terraformVersion) => {
    expect(repositoryConfigSchema.safeParse({ ...REPOSITORY_CONFIG_DEFAULTS, terraformVersion }).success).toBe(false);
  });

  it("rejects more than one repair attempt", () => {
    expect(repositoryConfigSchema.safeParse({ ...REPOSITORY_CONFIG_DEFAULTS, maxRepairAttempts: 2 }).success).toBe(false);
  });

  it("rejects unsupported context modes", () => {
    expect(repositoryConfigSchema.safeParse({ ...REPOSITORY_CONFIG_DEFAULTS, contextMode: "full" }).success).toBe(false);
  });

  it("rejects unsupported providers and malformed model identifiers", () => {
    expect(repositoryConfigSchema.safeParse({ ...REPOSITORY_CONFIG_DEFAULTS, modelProvider: "openai" }).success).toBe(false);
    expect(repositoryConfigSchema.safeParse({ ...REPOSITORY_CONFIG_DEFAULTS, model: "model id with spaces" }).success).toBe(false);
  });

  it("requires at least one failed stage", () => {
    expect(repositoryConfigSchema.safeParse({ ...REPOSITORY_CONFIG_DEFAULTS, failedStages: [] }).success).toBe(false);
  });
});
