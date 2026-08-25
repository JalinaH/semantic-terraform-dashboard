import { describe, expect, it } from "vitest";
import { calculateUsageSummary, type UsageRow } from "@/lib/analytics/usage";

function row(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    id: "run-1", repositoryId: "repo-1", repositoryFullName: "acme/infra", status: "COMPLETED",
    verificationStatus: "VERIFIED_FIRST_ATTEMPT", totalTokens: 2000, cachedInputTokens: 500,
    inputTokens: 1700, outputTokens: 300, llmCostUsd: "0.0014", costComplete: true,
    tokenCountsComplete: true, llmCallCount: 1, llmProvider: "openrouter", requestedModel: "openrouter/free",
    reportedModel: "provider/model-a", finalModelTier: "free", schemaAvoided: true, contextEscalated: false,
    modelEscalated: false, failureMemoryReused: false, resolutionSource: "llm", llmCalls: null,
    ...overrides,
  };
}

describe("usage aggregation", () => {
  it("calculates tokens, cached tokens, complete costs, averages, verification, calls, and optimization rates", () => {
    const summary = calculateUsageSummary([
      row(),
      row({ id: "run-2", verificationStatus: "VERIFIED_AFTER_RETRY", totalTokens: 3000, cachedInputTokens: 250, inputTokens: 2500, outputTokens: 500, llmCostUsd: "0.0026", llmCallCount: 2, schemaAvoided: false, contextEscalated: true, modelEscalated: true, failureMemoryReused: false }),
      row({ id: "run-3", verificationStatus: "VERIFICATION_FAILED", totalTokens: 1000, cachedInputTokens: 0, inputTokens: 850, outputTokens: 150, llmCostUsd: "0.001", llmCallCount: 1, schemaAvoided: null, contextEscalated: false, modelEscalated: false, failureMemoryReused: true }),
      row({ id: "run-crash", status: "FAILED", verificationStatus: "PENDING", totalTokens: null, tokenCountsComplete: null, llmCostUsd: null, costComplete: null, llmCallCount: null }),
    ], "30d");
    expect(summary.runCount).toBe(4);
    expect(summary.completedRunCount).toBe(3);
    expect(summary.verifiedFixes).toBe(2);
    expect(summary.locallyValidated).toBe(0);
    expect(summary.verificationRate).toBeCloseTo(2 / 3);
    expect(summary.totalTokens).toBe(6000);
    expect(summary.cachedInputTokens).toBe(750);
    expect(summary.aiSpendUsd).toBe("0.005");
    expect(summary.averageCostPerRunUsd).toBe("0.0016666666666666666667");
    expect(summary.costPerVerifiedFixUsd).toBe("0.0025");
    expect(summary.averageModelCallsPerRun).toBeCloseTo(4 / 3);
    expect(summary.schemaAvoidanceRate).toBe(0.5);
    expect(summary.contextEscalationRate).toBeCloseTo(1 / 3);
    expect(summary.modelEscalationRate).toBeCloseTo(1 / 3);
    expect(summary.memoryReuseRate).toBeCloseTo(1 / 3);
  });

  it("averages reporting runs but withholds cost per verified fix when selected telemetry is incomplete", () => {
    const summary = calculateUsageSummary([
      row(),
      row({ id: "run-2", totalTokens: null, tokenCountsComplete: false, llmCostUsd: null, costComplete: false }),
    ], "all");
    expect(summary.aiSpendUsd).toBe("0.0014");
    expect(summary.costCompleteRuns).toBe(1);
    expect(summary.tokenCompleteRuns).toBe(1);
    expect(summary.averageCostPerRunUsd).toBe("0.0014");
    expect(summary.averageTokensPerRun).toBe(2000);
    expect(summary.costPerVerifiedFixUsd).toBeNull();
    expect(summary.repositoryBreakdown[0].costPerVerifiedFixUsd).toBeNull();
  });

  it("counts only verified-memory resolutions as zero-LLM runs", () => {
    const summary = calculateUsageSummary([
      row({ id: "memory", totalTokens: 0, cachedInputTokens: 0, inputTokens: 0, outputTokens: 0, llmCostUsd: 0, llmCallCount: 0, resolutionSource: "verified_failure_memory", failureMemoryReused: true }),
      row({ id: "unknown-source", llmCallCount: 0, resolutionSource: null }),
      row({ id: "llm", llmCallCount: 1, resolutionSource: "llm" }),
    ], "7d");
    expect(summary.zeroLlmRuns).toBe(1);
    expect(summary.zeroLlmResolutionRate).toBe(0.5);
  });

  it("keeps historical null telemetry out of optimization denominators", () => {
    const summary = calculateUsageSummary([
      row({ id: "legacy", totalTokens: null, cachedInputTokens: null, inputTokens: null, outputTokens: null, tokenCountsComplete: null, llmCostUsd: null, costComplete: null, llmCallCount: null, requestedModel: null, reportedModel: null, finalModelTier: null, schemaAvoided: null, contextEscalated: null, modelEscalated: null, failureMemoryReused: null, resolutionSource: null }),
      row({ id: "v1", schemaAvoided: true, contextEscalated: false, modelEscalated: false, failureMemoryReused: false }),
    ], "30d");
    expect(summary.schemaAvoidanceReportedRuns).toBe(1);
    expect(summary.schemaAvoidanceRate).toBe(1);
    expect(summary.contextEscalationReportedRuns).toBe(1);
    expect(summary.memoryReuseReportedRuns).toBe(1);
  });

  it("groups repository and actual-model breakdowns without reading per-call JSON", () => {
    const summary = calculateUsageSummary([
      row({ id: "a", repositoryId: "repo-a", repositoryFullName: "acme/a", reportedModel: "provider/model-a", llmCallCount: 2, llmCalls: [{ reportedModel: "ignored/per-call" }] }),
      row({ id: "b", repositoryId: "repo-a", repositoryFullName: "acme/a", reportedModel: "provider/model-a", llmCallCount: 1 }),
      row({ id: "c", repositoryId: "repo-b", repositoryFullName: "acme/b", reportedModel: null, requestedModel: "router/request-b", llmCallCount: 1 }),
    ], "30d");
    expect(summary.repositoryBreakdown.map((item) => [item.repository, item.runs])).toEqual([["acme/a", 2], ["acme/b", 1]]);
    expect(summary.modelBreakdown[0]).toMatchObject({ model: "provider/model-a", calls: 3, runs: 2, verifiedFixes: 2 });
    expect(summary.modelBreakdown[1]).toMatchObject({ model: "router/request-b", calls: 1, runs: 1 });
  });
});
