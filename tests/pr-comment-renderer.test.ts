import { describe, expect, it } from "vitest";
import { MAX_PR_COMMENT_CHARS, MAX_PR_COMMENT_PATCH_CHARS, renderAgentComment } from "@/lib/publication/render-agent-comment";
import type { AgentCommentInput } from "@/lib/publication/types";

describe("PR comment renderer", () => {
  it.each([
    ["verified_first_attempt", "VERIFIED FIRST ATTEMPT"],
    ["verified_after_retry", "VERIFIED AFTER REPAIR"],
    ["verification_failed", "NOT VERIFIED"],
    ["patch_rejected", "PATCH REJECTED"],
    ["verification_unavailable", "VERIFICATION UNAVAILABLE"],
  ] as const)("renders %s with explicit verification stages", (verificationStatus, label) => {
    const result = renderAgentComment(input({ verificationStatus }));
    expect(result.body).toContain(label);
    expect(result.body).toContain("terraform validate`:");
    expect(result.body).toContain("Human review is still required because verification does not establish developer intent.");
    expect(result.body).toContain("http://localhost:3000/runs/run_1");
  });

  it("shows bounded repair attempt context", () => {
    const result = renderAgentComment(input({ verificationStatus: "verified_after_retry", llmCallTypes: ["diagnosis", "repair"], attempts: [
      { attempt: 1, status: "failed", failedStage: "fmt", commands: { fmt: { status: "failed" } } },
      { attempt: 2, status: "verified", failedStage: null, commands: { plan: { status: "passed" } } },
    ] }));
    expect(result.body).toContain("Repair attempt used:** Yes");
    expect(result.body).toContain("Attempt 1: failed at fmt");
    expect(result.body).toContain("Attempt 2: verified");
  });

  it("does not call every second model invocation a repair", () => {
    const result = renderAgentComment(input({ llmCallTypes: ["diagnosis", "context_escalation"], attempts: [
      { attempt: 1, status: "failed", failedStage: "plan", commands: { plan: { status: "failed" } } },
      { attempt: 2, status: "verified", failedStage: null, commands: { plan: { status: "passed" } } },
    ] }));
    expect(result.body).toContain("Repair attempt used:** No");
    expect(result.body).toContain("Context escalation");
    expect(result.body).not.toContain("Patch repair");
  });

  it("publishes the bounded environmental plan reason and conditional Apply advisory", () => {
    const result = renderAgentComment(input({ verificationStatus: "verification_unavailable", verificationOutcome: "environment_blocked", mutationEligibilityLevel: "conditional", planFailure: failure("permissions", "aws_access_denied") }));
    expect(result.body).toContain("ENVIRONMENT BLOCKED");
    expect(result.body).toContain("AWS / provider permissions");
    expect(result.body).toContain("The role is not authorized");
    expect(result.body).toContain("human-approved conditional Apply action");
    expect(result.body).toContain("Root cause");
  });

  it("publishes local validation as success with plan not requested", () => {
    const result = renderAgentComment(input({
      verificationStatus: "locally_validated_first_attempt",
      verificationOutcome: "locally_validated",
      verificationMode: "local",
      planRequested: false,
      mutationEligibilityLevel: "conditional",
      attempts: [{ attempt: 1, status: "locally_validated", failedStage: null, commands: { patch_check: { status: "passed" }, patch_apply: { status: "passed" }, fmt: { status: "passed" }, init: { status: "passed" }, validate: { status: "passed" }, plan: { status: "skipped" } } }],
    }));
    expect(result.body).toContain("LOCALLY VALIDATED");
    expect(result.body).toContain("`patch check`: passed");
    expect(result.body).toContain("`patch apply`: passed");
    expect(result.body).toContain("⏭️ `terraform plan`: not requested");
    expect(result.body).toContain("cloud verification is not configured");
    expect(result.body).not.toContain("The candidate recommendation was not fully verified");
  });

  it.each([
    ["semantic_failure", "terraform_semantic", "SEMANTIC FAILURE"],
    ["unknown_failure", "unknown", "PLAN FAILURE UNCLASSIFIED"],
  ] as const)("marks %s ineligible without replacing the diagnosis", (verificationOutcome, classification, label) => {
    const result = renderAgentComment(input({ verificationStatus: "verification_failed", verificationOutcome, mutationEligibilityLevel: "ineligible", planFailure: failure(classification, classification === "unknown" ? "unclassified_plan_failure" : "invalid_variable_value") }));
    expect(result.body).toContain(label);
    expect(result.body).toContain("not eligible for Apply to PR");
    expect(result.body).toContain("The hash key does not match");
  });

  it("bounds huge patches without breaking a malicious Markdown fence", () => {
    const patch = `diff --git a/main.tf b/main.tf\n\`\`\`\`\`\`\n${"+resource content\n".repeat(2_000)}`;
    const result = renderAgentComment(input({ suggestedPatch: patch }));
    expect(result.patchTruncated).toBe(true);
    expect(result.body.length).toBeLessThanOrEqual(MAX_PR_COMMENT_CHARS);
    expect(result.body).toContain("patch truncated");
    expect(result.body).toContain("`".repeat(7) + "diff");
    expect(result.body.length).toBeLessThan(patch.length + MAX_PR_COMMENT_PATCH_CHARS);
  });

  it("bounds long root causes while retaining mandatory content", () => {
    const result = renderAgentComment(input({ rootCause: "cause ".repeat(20_000) }));
    expect(result.body.length).toBeLessThanOrEqual(MAX_PR_COMMENT_CHARS);
    expect(result.body).toContain("Root cause");
    expect(result.body).toContain("Affected resources");
    expect(result.body).toContain("Final status");
    expect(result.body).toContain("Human review is still required");
    expect(result.body).toContain("View full diagnosis");
  });

  it("redacts publication-layer secrets without hiding harmless Terraform IDs", () => {
    const accessKey = `AKIA${"A".repeat(16)}`;
    const githubToken = `github_pat_${"b".repeat(30)}`;
    const result = renderAgentComment(input({
      rootCause: `credentials ${accessKey} Bearer ${githubToken}`,
      suggestedPatch: "GEMINI_API_KEY=secret-value\n-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\nresource = aws_s3_bucket.assets",
    }));
    expect(result.body).not.toContain(accessKey);
    expect(result.body).not.toContain(githubToken);
    expect(result.body).not.toContain("secret-value");
    expect(result.body).not.toContain("BEGIN PRIVATE KEY");
    expect(result.body).toContain("aws_s3_bucket.assets");
    expect(result.redactionWarnings).toEqual(expect.arrayContaining(["aws_access_key", "github_token", "private_key", "secret_environment"]));
  });
});

function input(overrides: Partial<AgentCommentInput> = {}): AgentCommentInput {
  return {
    runId: "run_1",
    repositoryFullName: "acme/infrastructure",
    rootCause: "The hash key does not match the declared DynamoDB attribute.",
    affectedResources: ["aws_dynamodb_table.orders"],
    violatedConstraint: "hash_key must match an attribute name",
    suggestedPatch: "diff --git a/main.tf b/main.tf\n-hash_key = \"id2\"\n+hash_key = \"id\"",
    verificationStatus: "verified_first_attempt",
    modelConfidence: 0.98,
    evidenceScore: 0.8,
    attempts: [{ attempt: 1, status: "verified", failedStage: null, commands: { patch_check: { status: "passed" }, patch_apply: { status: "passed" }, fmt: { status: "passed" }, init: { status: "passed" }, validate: { status: "passed" }, plan: { status: "passed" } } }],
    dashboardUrl: "http://localhost:3000/runs/run_1",
    ...overrides,
  };
}

function failure(classification: "permissions" | "terraform_semantic" | "unknown", reasonCode: string) {
  return { classification, reasonCode, summary: "The role is not authorized.", detail: "Bounded detail", sourceFile: "main.tf", sourceLine: 4, resourceAddress: "aws_s3_bucket.example", diagnosticFormat: "terraform_json" as const };
}
