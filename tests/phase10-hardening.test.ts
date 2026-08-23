import { afterEach, describe, expect, it } from "vitest";
import { GET as healthcheck } from "@/app/api/health/route";
import {
  getDashboardRuntimeConfigurationStatus,
  getWorkerRuntimeConfigurationStatus,
  PINNED_AGENT_VERSION,
} from "@/lib/config";
import { getWorkerErrorPresentation } from "@/lib/worker/user-errors";
import { verifyInstalledAgentVersion } from "@/worker/version";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("Phase 10 runtime hardening", () => {
  it("reports exact missing dashboard variables without exposing values", () => {
    for (const name of ["DATABASE_URL", "AUTH_SECRET", "AUTH_TRUST_HOST", "GITHUB_APP_ID", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_SLUG", "GITHUB_WEBHOOK_SECRET", "AWS_CONTROL_PLANE_REGION", "AWS_ASSUME_ROLE_PRINCIPAL_ARN", "NEXT_PUBLIC_APP_URL"]) delete process.env[name];
    const status = getDashboardRuntimeConfigurationStatus();
    expect(status.configured).toBe(false);
    expect(status.missing).toContain("GITHUB_WEBHOOK_SECRET");
    expect(JSON.stringify(status)).not.toContain("PRIVATE KEY-----");
  });

  it("requires the hosted worker model credential and pinned engine version", () => {
    process.env.DATABASE_URL = "postgresql://example.invalid/db";
    process.env.GITHUB_APP_CLIENT_ID = "client";
    process.env.GITHUB_APP_PRIVATE_KEY = "private";
    process.env.AWS_CONTROL_PLANE_REGION = "us-east-1";
    process.env.AWS_ASSUME_ROLE_PRINCIPAL_ARN = "arn:aws:iam::123456789012:role/TerraFixControlPlane";
    delete process.env.OPENROUTER_API_KEY;
    process.env.SEMANTIC_TERRAFORM_AGENT_VERSION = "1.0.1";
    const status = getWorkerRuntimeConfigurationStatus();
    expect(status.missing).toEqual(["OPENROUTER_API_KEY"]);
    expect(status.invalid).toEqual(["SEMANTIC_TERRAFORM_AGENT_VERSION"]);
  });

  it("verifies installed Python package metadata against the pinned version", async () => {
    const runner = async () => ({ exitCode: 0, stdout: `${PINNED_AGENT_VERSION}\n`, stderr: "", timedOut: false });
    await expect(verifyInstalledAgentVersion(PINNED_AGENT_VERSION, runner)).resolves.toBe("1.0.0");
    await expect(verifyInstalledAgentVersion(PINNED_AGENT_VERSION, async () => ({ exitCode: 0, stdout: "1.0.1\n", stderr: "", timedOut: false }))).rejects.toMatchObject({ code: "agent_version_mismatch" });
  });

  it("returns a public process-only health response with no-store headers", async () => {
    const response = await healthcheck();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "TerraFix", agentVersion: "1.0.0" });
  });

  it("maps operational codes to actionable, non-sensitive guidance", () => {
    expect(getWorkerErrorPresentation("aws_assume_role_failed")).toEqual(expect.objectContaining({
      message: expect.stringContaining("AWS role"),
      action: expect.stringContaining("Re-verify"),
    }));
    expect(getWorkerErrorPresentation("unknown").action).toContain("run ID");
  });
});
