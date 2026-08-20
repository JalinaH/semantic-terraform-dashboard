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
      "--model", "gemini-3.6-flash",
      "--context-mode", "auto",
      "--verify-patch",
      "--max-repair-attempts", "1",
      "--output", "/tmp/result.json",
    ]);
  });

  it("uses an allowlisted child environment and never forwards control-plane or GitHub secrets", () => {
    process.env.DATABASE_URL = "postgresql://secret";
    process.env.GITHUB_APP_PRIVATE_KEY = "private-key";
    process.env.GITHUB_WEBHOOK_SECRET = "webhook-secret";
    process.env.GEMINI_API_KEY = "hosted-model-key";
    const environment = createAgentEnvironment({ accessKeyId: "temporary-id", secretAccessKey: "temporary-secret", sessionToken: "temporary-session", region: "us-east-1" });
    expect(environment).toMatchObject({ GEMINI_API_KEY: "hosted-model-key", AWS_ACCESS_KEY_ID: "temporary-id", AWS_SESSION_TOKEN: "temporary-session" });
    expect(environment).not.toHaveProperty("DATABASE_URL");
    expect(environment).not.toHaveProperty("GITHUB_APP_PRIVATE_KEY");
    expect(environment).not.toHaveProperty("GITHUB_WEBHOOK_SECRET");
  });

  it("rejects a repository Terraform version absent from the pinned worker image", () => {
    expect(() => validateTerraformRuntimeVersion("1.15.7", "1.15.7")).not.toThrow();
    expect(() => validateTerraformRuntimeVersion("1.16.0", "1.15.7")).toThrow(expect.objectContaining({ code: "terraform_version_unavailable" }));
  });
});
