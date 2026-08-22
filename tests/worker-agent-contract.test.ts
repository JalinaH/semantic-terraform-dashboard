import { afterEach, describe, expect, it } from "vitest";
import { buildAgentArguments, createAgentEnvironment, validateTerraformRuntimeVersion } from "@/worker/agent";
import { claimedRun } from "@/tests/phase5-fixtures";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("Python agent process boundary", () => {
  it("passes the exact checkout, diff, stage, model, context, verification, and repair arguments", () => {
    const args = buildAgentArguments({
      run: claimedRun(),
      workspace: { checkoutPath: "/tmp/repo", failureLogPath: "/tmp/failure.log", diffPath: "/tmp/change.diff", failedStage: "plan", cleanup: async () => undefined },
    }, "/tmp/result.json");
    expect(args).toEqual([
      "diagnose",
      "--repo-path", "/tmp/repo",
      "--terraform-dir", "terraform",
      "--log-file", "/tmp/failure.log",
      "--diff-file", "/tmp/change.diff",
      "--failed-stage", "plan",
      "--provider", "gemini",
      "--model-routing", "fixed",
      "--max-model-tier", "free",
      "--context-mode", "auto",
      "--verify-patch",
      "--max-repair-attempts", "1",
      "--output", "/tmp/result.json",
      "--model", "gemini-3.6-flash",
    ]);
  });

  it("uses an allowlisted child environment and never forwards control-plane or GitHub secrets", () => {
    process.env.DATABASE_URL = "postgresql://secret";
    process.env.GITHUB_APP_PRIVATE_KEY = "private-key";
    process.env.GITHUB_WEBHOOK_SECRET = "webhook-secret";
    process.env.GEMINI_API_KEY = "hosted-model-key";
    process.env.OPENROUTER_API_KEY = "openrouter-key";
    const environment = createAgentEnvironment({ accessKeyId: "temporary-id", secretAccessKey: "temporary-secret", sessionToken: "temporary-session", region: "us-east-1" });
    expect(environment).toMatchObject({ GEMINI_API_KEY: "hosted-model-key", OPENROUTER_API_KEY: "openrouter-key", AWS_ACCESS_KEY_ID: "temporary-id", AWS_SESSION_TOKEN: "temporary-session" });
    expect(environment).not.toHaveProperty("DATABASE_URL");
    expect(environment).not.toHaveProperty("GITHUB_APP_PRIVATE_KEY");
    expect(environment).not.toHaveProperty("GITHUB_WEBHOOK_SECRET");
  });

  it("maps Auto Optimize to agent v1 routing and an immutable registry path", () => {
    const args = buildAgentArguments({
      run: claimedRun({ config: { ...claimedRun().config, modelProvider: "openrouter", model: "openrouter/free", modelRouting: "auto", maxModelTier: "free", fixedModelId: null, modelPolicyVersion: "terrafix_model_policy_v1", modelRegistry: [{ provider: "openrouter", model_id: "openrouter/free", tier: "free", priority: 10, enabled: true, supports_structured_output: false, supports_json_fallback: true, supports_tools: false, max_context_tokens: 128_000, notes: "test" }] } }),
      workspace: { checkoutPath: "/tmp/repo", failureLogPath: "/tmp/failure.log", diffPath: "/tmp/change.diff", failedStage: "plan", cleanup: async () => undefined },
    }, "/tmp/result.json", "/tmp/model-registry.json");
    expect(args).toContain("auto");
    expect(args).toContain("free");
    expect(args.slice(-2)).toEqual(["--model-registry", "/tmp/model-registry.json"]);
    expect(args).not.toContain("--model");
  });

  it("rejects a repository Terraform version absent from the pinned worker image", () => {
    expect(() => validateTerraformRuntimeVersion("1.15.7", "1.15.7")).not.toThrow();
    expect(() => validateTerraformRuntimeVersion("1.16.0", "1.15.7")).toThrow(expect.objectContaining({ code: "terraform_version_unavailable" }));
  });
});
