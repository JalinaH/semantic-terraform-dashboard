import { REPOSITORY_CONFIG_DEFAULTS } from "@/lib/repository-config/constants";
import type { ClaimedAgentRun } from "@/lib/worker/types";

export function workflowRunPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: "completed",
    installation: { id: 9001 },
    repository: { id: 42, name: "infrastructure", full_name: "acme/infrastructure", owner: { login: "acme" } },
    workflow_run: {
      id: 7001,
      run_attempt: 1,
      name: "Terraform CI",
      event: "pull_request",
      status: "completed",
      conclusion: "failure",
      head_sha: "b".repeat(40),
      head_branch: "fix/table",
      pull_requests: [{ number: 12 }],
      ...overrides,
    },
  };
}

export function repositorySnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: "repo_1",
    installationDatabaseId: "install_1",
    installationId: "9001",
    installationActive: true,
    accessible: true,
    config: { ...REPOSITORY_CONFIG_DEFAULTS },
    awsConnected: true,
    ...overrides,
  };
}

export function executionContext(overrides: Record<string, unknown> = {}) {
  return {
    pullRequestNumber: 12,
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    commitSha: "b".repeat(40),
    branch: "fix/table",
    changedFiles: ["terraform/main.tf"],
    isForkPullRequest: false,
    comparisonFallback: null,
    ...overrides,
  };
}

export function claimedRun(overrides: Partial<ClaimedAgentRun> = {}): ClaimedAgentRun {
  return {
    id: "run_1",
    repositoryId: "repo_1",
    repositoryOwner: "acme",
    repositoryName: "infrastructure",
    repositoryFullName: "acme/infrastructure",
    repositoryAccessible: true,
    installationId: "9001",
    installationActive: true,
    githubRunId: "7001",
    commitSha: "b".repeat(40),
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    pullRequestNumber: 12,
    aws: { roleArn: "arn:aws:iam::123456789012:role/STFA", externalId: "external", region: "us-east-1", connected: true },
    config: { terraformDir: "terraform", terraformVersion: "1.15.7", modelProvider: "gemini", model: "gemini-3.6-flash", contextMode: "auto", maxRepairAttempts: 1, failedStages: ["validate", "plan"] },
    ...overrides,
  };
}

export function validAgentResult(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok",
    repository: { terraform_dir: "terraform", terraform_files: ["main.tf"], changed_terraform_files: ["main.tf"], diff_source: "file", diff_comparison: "base..head" },
    terraform: { version: "1.15.7", schema_extraction_status: "available" },
    failure: { summary: "Invalid capacity", detail: "Capacity is below the provider minimum", stage: "plan", resource_address: "aws_dynamodb_table.orders" },
    context: { requested_mode: "auto", selected_mode: "schema-aware", selection_reason: "Provider constraint requires schema evidence" },
    diagnosis: {
      initial: { root_cause: "read_capacity is invalid", affected_resources: ["aws_dynamodb_table.orders"], violated_constraint: "read_capacity must be at least 1", suggested_patch: "patch", model_confidence: 0.91 },
      repair: null,
      attempts: [{
        attempt: 1,
        patch: "patch",
        status: "verified",
        failed_stage: null,
        isolation: "temporary-copy",
        changed_files: ["main.tf"],
        commands: {
          patch_check: { command: ["git", "apply", "--check"], status: "passed", exit_code: 0, duration_seconds: 0.1, stdout: "must not persist" },
          patch_apply: { command: ["git", "apply"], status: "passed", exit_code: 0, duration_seconds: 0.1 },
          fmt: { command: ["terraform", "fmt"], status: "passed", exit_code: 0, duration_seconds: 0.2 },
          init: { command: ["terraform", "init"], status: "passed", exit_code: 0, duration_seconds: 1 },
          validate: { command: ["terraform", "validate"], status: "passed", exit_code: 0, duration_seconds: 0.4 },
          plan: { command: ["terraform", "plan"], status: "passed", exit_code: 0, duration_seconds: 2 },
        },
        temporary_copy_cleaned: true,
        warnings: [],
      }],
      final_patch: "diff --git a/main.tf b/main.tf\n-read_capacity=0\n+read_capacity=1",
      verification_status: "verified_first_attempt",
      model_confidence: 0.91,
      evidence_score: 0.88,
      verification: { passed: true, status: "verified_first_attempt", failed_stage: null, reason: null },
    },
    timing: { collection_seconds: 0.2, llm_seconds: 1.5, verification_seconds: 3.8, total_seconds: 5.5 },
    token_usage: { input_tokens: 1200, output_tokens: 320, total_tokens: 1520 },
    warnings: [],
    ...overrides,
  };
}
