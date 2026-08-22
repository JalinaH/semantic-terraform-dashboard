import { describe, expect, it } from "vitest";
import { compareMetric } from "@/lib/analytics/comparison";
import { calculateDailyUsage, calculateReduction, usagePeriodRanges, type AnalyticsRow } from "@/lib/analytics/trends";

function row(overrides: Partial<AnalyticsRow> = {}): AnalyticsRow {
  return {
    id: "run-1", repositoryId: "repo-1", repositoryFullName: "acme/infra", createdAt: new Date("2026-08-20T12:00:00Z"), status: "COMPLETED", verificationStatus: "VERIFIED_FIRST_ATTEMPT",
    totalTokens: 120, cachedInputTokens: 20, inputTokens: 100, outputTokens: 20, llmCostUsd: "0.0004", costComplete: true, tokenCountsComplete: true, llmCallCount: 1,
    llmProvider: "openrouter", requestedModel: "openrouter/free", reportedModel: "provider/model-a", initialModelTier: "free", finalModelTier: "free", schemaAvoided: true,
    contextEscalated: false, modelEscalated: false, failureMemoryReused: false, resolutionSource: "llm", llmCalls: null, sourceReductionRatio: 0.8, schemaReductionRatio: 0.9,
    freshVerificationPassed: true, failureMemoryStatus: "miss", historicalTokensAvoided: null, historicalCostAvoidedUsd: null, ...overrides,
  };
}

describe("Phase 8 daily analytics", () => {
  it("buckets by UTC, combines runs, and fills empty calendar days", () => {
    const points = calculateDailyUsage([
      row({ id: "a", createdAt: new Date("2026-08-20T23:59:59Z") }),
      row({ id: "b", createdAt: new Date("2026-08-21T00:00:00Z"), totalTokens: 80 }),
      row({ id: "c", createdAt: new Date("2026-08-21T18:00:00Z"), totalTokens: 20 }),
    ], new Date("2026-08-20T00:00:00Z"), new Date("2026-08-23T00:00:00Z"));
    expect(points.map((point) => [point.date, point.runs, point.totalTokens])).toEqual([
      ["2026-08-20", 1, 120], ["2026-08-21", 2, 100], ["2026-08-22", 0, null],
    ]);
  });

  it("preserves explicit zero while missing token and cost telemetry remains null", () => {
    const points = calculateDailyUsage([
      row({ id: "free", totalTokens: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, llmCostUsd: 0 }),
      row({ id: "legacy", totalTokens: null, tokenCountsComplete: null, llmCostUsd: null, costComplete: null }),
    ]);
    expect(points[0]).toMatchObject({ totalTokens: 0, aiCostUsd: "0", tokenReportingRuns: 1, costReportingRuns: 1, completedRuns: 2 });
    const missing = calculateDailyUsage([row({ totalTokens: null, tokenCountsComplete: null, llmCostUsd: null, costComplete: null })]);
    expect(missing[0].totalTokens).toBeNull();
    expect(missing[0].aiCostUsd).toBeNull();
  });

  it("uses raw eligible counts for verification and optimization rates", () => {
    const point = calculateDailyUsage([
      row(),
      row({ id: "retry", verificationStatus: "VERIFICATION_FAILED", schemaAvoided: false, contextEscalated: true, modelEscalated: true, failureMemoryReused: true, resolutionSource: "verified_failure_memory", llmCallCount: 0 }),
      row({ id: "legacy", schemaAvoided: null, contextEscalated: null, modelEscalated: null, failureMemoryReused: null, resolutionSource: null }),
      row({ id: "crash", status: "FAILED", verificationStatus: "PENDING" }),
    ])[0];
    expect(point).toMatchObject({ completedRuns: 3, verifiedRuns: 2, schemaAvoidedRuns: 1, schemaAvoidanceEligibleRuns: 2, contextEscalatedRuns: 1, contextEscalationEligibleRuns: 2, memoryReusedRuns: 1, memoryEligibleRuns: 2, zeroLlmRuns: 1 });
    expect(point.verificationRate).toBeCloseTo(2 / 3);
  });

  it("sums decimal cost without binary floating-point accumulation", () => {
    const point = calculateDailyUsage([row({ llmCostUsd: "0.1" }), row({ id: "two", llmCostUsd: "0.2" })])[0];
    expect(point.aiCostUsd).toBe("0.3");
  });
});

describe("Phase 8 comparison and reduction utilities", () => {
  it("creates aligned current and previous UTC periods", () => {
    const ranges = usagePeriodRanges("7d", new Date("2026-08-22T23:30:00-05:00"));
    expect(ranges.current.start?.toISOString()).toBe("2026-08-17T00:00:00.000Z");
    expect(ranges.current.end.toISOString()).toBe("2026-08-24T00:00:00.000Z");
    expect(ranges.previous?.start.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("handles positive, negative, zero-baseline, null, and invalid comparisons", () => {
    expect(compareMetric(80, 100)).toEqual({ kind: "percent", change: -0.2 });
    expect(compareMetric(120, 100)).toEqual({ kind: "percent", change: 0.2 });
    expect(compareMetric(10, 0)).toEqual({ kind: "new" });
    expect(compareMetric(0, 0)).toBeNull();
    expect(compareMetric(null, 1)).toBeNull();
    expect(compareMetric(-1, 1)).toBeNull();
  });

  it("calculates mean and median over individual eligible reductions", () => {
    expect(calculateReduction([0.2, 0.8, 0.6, 0.4, null])).toEqual({ mean: 0.5, median: 0.5, reportedRuns: 4 });
    expect(calculateReduction([null, 1.2])).toEqual({ mean: null, median: null, reportedRuns: 0 });
  });
});
