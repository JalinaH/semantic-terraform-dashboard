import { renderToStaticMarkup } from "react-dom/server";
import { BrainCircuit } from "lucide-react";
import { describe, expect, it } from "vitest";
import { RunObservability } from "@/components/run-observability";
import { EmptyState } from "@/components/empty-state";
import { UsageCompletenessWarning } from "@/components/usage-completeness-warning";
import type { RunDetail } from "@/lib/runs/types";

function run(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    id: "run-1", repositoryId: "repo-1", repositoryFullName: "acme/infra", pullRequestNumber: 4,
    commitSha: "a".repeat(40), failedStage: "plan", workerStage: "completed", affectedResource: "aws_s3_bucket.example",
    status: "completed", verificationStatus: "verified_first_attempt", totalRuntimeMs: 4000, createdAt: new Date().toISOString(), publicationStatus: "published",
    displayModel: "provider/model", totalTokens: 2060, llmCostUsd: "0", costComplete: true,
    githubWorkflowName: "Terraform", branch: "fix", contextMode: "auto", model: "openrouter/free", rootCause: "cause",
    violatedConstraint: "constraint", suggestedPatch: "patch", affectedResources: ["aws_s3_bucket.example"], modelConfidence: 0.9,
    evidenceScore: 0.9, attempts: [], timing: {}, inputTokens: 1842, outputTokens: 218, cachedInputTokens: 1100,
    reasoningTokens: 20, llmCallCount: 1, llmLatencyMs: 1820, llmProvider: "openrouter", requestedModel: "openrouter/free",
    reportedModel: "provider/model", upstreamProvider: "Provider", routingMode: "auto", maxModelTier: "free", initialModel: "provider/model",
    configuredModelRouting: "auto", configuredMaxModelTier: "free", configuredModelId: null, accountAccessLevel: "FREE", modelPolicyVersion: "terrafix_model_policy_v1", catalogSyncedAt: "2026-08-23T00:00:00.000Z",
    finalModel: "provider/model", initialModelTier: "free", finalModelTier: "free", modelEscalated: false, initialContextLevel: "minimal",
    finalContextLevel: "minimal", contextEscalated: false, contextEscalationReason: null, schemaRetrieved: false, schemaAvoided: true,
    sourceCharactersAvailable: 18200, sourceCharactersSelected: 3100, sourceReductionRatio: 0.83, schemaCharactersAvailable: null,
    promptContext: null, schemaCharactersSelected: null, schemaReductionRatio: null, failureMemoryStatus: "miss", failureMemoryReused: false,
    freshVerificationPassed: null, resolutionSource: "llm", candidateSource: "llm", llmCallsAvoided: 0, historicalTokensAvoided: null,
    historicalCostAvoidedUsd: null, agentVersion: "1.0.0", verificationFailedStage: null, verificationReason: null, llmCalls: [{ callNumber: 1, type: "diagnosis", contextLevel: "minimal", provider: "openrouter", requestedModel: "openrouter/free", reportedModel: "provider/model", upstreamProvider: "Provider", routingTier: "free", routingReason: "initial", inputTokens: 1842, cachedInputTokens: 1100, outputTokens: 218, reasoningTokens: 20, totalTokens: 2060, costUsd: 0, latencyMs: 1820, cacheHit: true }],
    errorCode: null, errorMessage: null, skipReason: null, startedAt: null, completedAt: null, publication: null,
    patchSha256: null, verifiedAgainstCommitSha: null, patchAffectedFiles: [], patchTerraformFilesOnly: null,
    patchExistingFilesOnly: null, mutationEligible: null, mutationEligibilityLevel: null, mutationEligibilityReason: null,
    verificationOutcome: null, assessmentPatchCheckPassed: null, assessmentPatchApplyPassed: null, assessmentFmtPassed: null,
    assessmentInitPassed: null, assessmentValidatePassed: null, assessmentPlanAttempted: null, assessmentPlanPassed: null,
    assessmentFullVerificationPassed: null, applySafety: null, planFailure: null, patchApplications: [],
    ...overrides,
  };
}

describe("usage observability UI", () => {
  it("renders AI usage, per-call detail, context optimization, routing, and memory state", () => {
    const html = renderToStaticMarkup(<RunObservability run={run()} />);
    expect(html).toContain("AI Usage");
    expect(html).toContain("Free ($0.000000)");
    expect(html).toContain("Per-call breakdown");
    expect(html).toContain("Context Optimization");
    expect(html).toContain("Provider schema avoided");
    expect(html).toContain("Model Routing");
    expect(html).toContain("Verified Failure Memory");
  });

  it("explains explicit zero source blocks while showing separately reported diff context", () => {
    const html = renderToStaticMarkup(<RunObservability run={run({
      sourceCharactersAvailable: 1639,
      sourceCharactersSelected: 0,
      sourceReductionRatio: 1,
      promptContext: { gitDiffIncluded: true, changedLineCount: 2, selectedContextCharacters: 510, renderedUserPromptCharacters: 600, sourceFileCount: 1, sourceBlockCount: 0, sections: { terraform_error: 192, git_diff: 318, terraform_source: 0 } },
    })} />);
    expect(html).toContain("Terraform source blocks");
    expect(html).toContain("No standalone Terraform source block was included");
    expect(html).toContain("The relevant Terraform diff was included separately");
    expect(html).toContain("Terraform diff included");
    expect(html).toContain("318 chars");
  });

  it("renders the zero-LLM verified-memory explanation with fresh verification", () => {
    const html = renderToStaticMarkup(<RunObservability run={run({ llmCallCount: 0, llmCostUsd: "0", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, resolutionSource: "verified_failure_memory", candidateSource: "verified_failure_memory", failureMemoryStatus: "hit_verified", failureMemoryReused: true, freshVerificationPassed: true, llmCallsAvoided: 1, historicalTokensAvoided: 2184, historicalCostAvoidedUsd: "0.0014", llmCalls: [] })} />);
    expect(html).toContain("0 LLM calls required");
    expect(html).toContain("re-verified the candidate patch");
    expect(html).not.toContain("automatically trusted");
  });

  it("renders bounded environment-blocked plan details separately from the diagnosis", () => {
    const html = renderToStaticMarkup(<RunObservability run={run({ verificationOutcome: "environment_blocked", assessmentPatchCheckPassed: true, assessmentPatchApplyPassed: true, assessmentFmtPassed: true, assessmentInitPassed: true, assessmentValidatePassed: true, assessmentPlanAttempted: true, assessmentPlanPassed: false, assessmentFullVerificationPassed: false, applySafety: "conditionally_eligible", planFailure: { classification: "permissions", reasonCode: "aws_access_denied", summary: "The role is not authorized.", detail: "Access denied by provider.", sourceFile: "main.tf", sourceLine: 4, resourceAddress: "aws_s3_bucket.example", diagnosticFormat: "terraform_json" } })} />);
    expect(html).toContain("ENVIRONMENT BLOCKED");
    expect(html).toContain("AWS / provider permissions");
    expect(html).toContain("main.tf:4");
    expect(html).toContain("Terraform JSON diagnostic");
  });

  it("renders legacy unknown telemetry without converting it to zero", () => {
    const html = renderToStaticMarkup(<RunObservability run={run({ llmCallCount: null, llmCostUsd: null, totalTokens: null, inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, agentVersion: null, initialContextLevel: null, finalContextLevel: null, contextEscalated: null, routingMode: null, initialModel: null, failureMemoryStatus: null, llmCalls: [] })} />);
    expect(html).toContain("Not reported");
    expect(html).toContain("Legacy run");
    expect(html).not.toContain("$0.000000");
  });

  it("renders the usage empty state and incomplete-cost warning", () => {
    const html = renderToStaticMarkup(<><EmptyState icon={BrainCircuit} title="No usage data yet" description="TerraFix will show usage after your first diagnosis." /><UsageCompletenessWarning>Cost totals include 2 of 3 runs.</UsageCompletenessWarning></>);
    expect(html).toContain("No usage data yet");
    expect(html).toContain("Cost totals include 2 of 3 runs");
  });
});
