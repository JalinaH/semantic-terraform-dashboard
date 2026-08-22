import "server-only";

import { AgentRunStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { calculateUsageSummary, isDiagnosableUsageStatus, isVerifiedUsageStatus, type UsagePeriod, type UsageRow, type UsageSummary } from "./usage";

export type AnalyticsRow = UsageRow & {
  createdAt: Date;
  initialModelTier: string | null;
  sourceReductionRatio: number | null;
  schemaReductionRatio: number | null;
  freshVerificationPassed: boolean | null;
  failureMemoryStatus: string | null;
  historicalTokensAvoided: number | null;
  historicalCostAvoidedUsd: Prisma.Decimal | number | string | null;
};

export type DailyUsagePoint = {
  date: string;
  runs: number;
  completedRuns: number;
  verifiedRuns: number;
  verificationRate: number | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  aiCostUsd: string | null;
  tokenReportingRuns: number;
  costReportingRuns: number;
  schemaAvoidedRuns: number;
  schemaAvoidanceEligibleRuns: number;
  contextEscalatedRuns: number;
  contextEscalationEligibleRuns: number;
  modelEscalatedRuns: number;
  modelEscalationEligibleRuns: number;
  memoryReusedRuns: number;
  memoryEligibleRuns: number;
  zeroLlmRuns: number;
  resolutionSourceReportingRuns: number;
};

export type ReductionStatistics = { mean: number | null; median: number | null; reportedRuns: number };
export type UsageAnalytics = {
  period: UsagePeriod;
  timezone: "UTC";
  current: UsageSummary;
  previous: UsageSummary | null;
  daily: DailyUsagePoint[];
  sourceReduction: ReductionStatistics;
  schemaReduction: ReductionStatistics;
  initialTierDistribution: TierDistribution[];
  finalTierDistribution: TierDistribution[];
  historicalTokensAvoided: number;
  historicalCostAvoidedUsd: string;
  historicalSavingsReportingRuns: number;
  memory: { reusedRuns: number; staleHits: number; freshVerifyPassed: number; freshVerifyReported: number; zeroLlmRuns: number };
  repositories: Array<{ id: string; fullName: string }>;
  models: string[];
};
export type TierDistribution = { tier: string; runs: number; rate: number };

export function usagePeriodRanges(period: UsagePeriod, now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  if (period === "all") return { current: { start: undefined, end }, previous: null };
  const days = period === "7d" ? 7 : 30;
  const start = shiftUtcDays(end, -days);
  return { current: { start, end }, previous: { start: shiftUtcDays(start, -days), end: start } };
}

export async function getUsageAnalytics(input: { userId: string; period: UsagePeriod; repositoryId?: string; model?: string; now?: Date }): Promise<UsageAnalytics | null> {
  const repositoryWhere = { installation: { userInstallations: { some: { userId: input.userId } } } } as const;
  const repositories = await db.repository.findMany({ where: repositoryWhere, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } });
  if (input.repositoryId && !repositories.some((repository) => repository.id === input.repositoryId)) return null;
  const modelRows = await db.agentRun.findMany({ where: { repository: repositoryWhere }, select: { reportedModel: true, requestedModel: true, model: true }, distinct: ["reportedModel", "requestedModel", "model"] });
  const models = [...new Set(modelRows.flatMap((row) => [row.reportedModel, row.requestedModel, row.model]).filter((value): value is string => Boolean(value)))].sort();
  if (input.model && !models.includes(input.model)) return null;
  const ranges = usagePeriodRanges(input.period, input.now);
  const where = {
    repository: { ...repositoryWhere, ...(input.repositoryId ? { id: input.repositoryId } : {}) },
    ...(ranges.current.start ? { createdAt: { gte: ranges.previous?.start ?? ranges.current.start, lt: ranges.current.end } } : { createdAt: { lt: ranges.current.end } }),
    ...(input.model ? { OR: [{ reportedModel: input.model }, { requestedModel: input.model }, { model: input.model }] } : {}),
  };
  const rows = await db.agentRun.findMany({ where, select: analyticsSelect, orderBy: { createdAt: "asc" } });
  const mapped = rows.map((row) => ({ ...row, repositoryFullName: row.repository.fullName, llmCalls: null })) as AnalyticsRow[];
  const currentRows = mapped.filter((row) => (!ranges.current.start || row.createdAt >= ranges.current.start) && row.createdAt < ranges.current.end);
  const previousRows = ranges.previous ? mapped.filter((row) => row.createdAt >= ranges.previous!.start && row.createdAt < ranges.previous!.end) : [];
  return {
    period: input.period,
    timezone: "UTC",
    current: calculateUsageSummary(currentRows, input.period),
    previous: ranges.previous ? calculateUsageSummary(previousRows, input.period) : null,
    daily: calculateDailyUsage(currentRows, ranges.current.start, ranges.current.end),
    sourceReduction: calculateReduction(currentRows.map((row) => row.sourceReductionRatio)),
    schemaReduction: calculateReduction(currentRows.map((row) => row.schemaReductionRatio)),
    initialTierDistribution: tierDistribution(currentRows, "initialModelTier"),
    finalTierDistribution: tierDistribution(currentRows, "finalModelTier"),
    historicalTokensAvoided: currentRows.reduce((sum, row) => sum + (row.historicalTokensAvoided ?? 0), 0),
    historicalCostAvoidedUsd: decimalSum(currentRows.map((row) => row.historicalCostAvoidedUsd)).toFixed(),
    historicalSavingsReportingRuns: currentRows.filter((row) => row.historicalTokensAvoided !== null || row.historicalCostAvoidedUsd !== null).length,
    memory: memoryStatistics(currentRows),
    repositories,
    models,
  };
}

export function calculateDailyUsage(rows: AnalyticsRow[], start?: Date, end?: Date): DailyUsagePoint[] {
  if (!rows.length && (!start || !end)) return [];
  const buckets = new Map<string, AnalyticsRow[]>();
  for (const row of rows) {
    const key = utcDateKey(row.createdAt);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  const keys = start && end ? dateKeys(start, end) : [...buckets.keys()].sort();
  return keys.map((date) => dailyPoint(date, buckets.get(date) ?? []));
}

export function calculateReduction(values: Array<number | null>): ReductionStatistics {
  const reported = values.filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0 && value <= 1).sort((a, b) => a - b);
  if (!reported.length) return { mean: null, median: null, reportedRuns: 0 };
  const middle = Math.floor(reported.length / 2);
  return { mean: reported.reduce((sum, value) => sum + value, 0) / reported.length, median: reported.length % 2 ? reported[middle] : (reported[middle - 1] + reported[middle]) / 2, reportedRuns: reported.length };
}

function dailyPoint(date: string, rows: AnalyticsRow[]): DailyUsagePoint {
  const completed = rows.filter(isCompletedDiagnosis);
  const tokenRows = completed.filter((row) => row.tokenCountsComplete === true && row.totalTokens !== null);
  const costRows = completed.filter((row) => row.costComplete === true && row.llmCostUsd !== null);
  const verifiedRuns = completed.filter((row) => isVerifiedUsageStatus(row.verificationStatus)).length;
  const bool = (key: "schemaAvoided" | "contextEscalated" | "modelEscalated" | "failureMemoryReused") => completed.filter((row) => row[key] !== null);
  const schema = bool("schemaAvoided"), context = bool("contextEscalated"), model = bool("modelEscalated"), memory = bool("failureMemoryReused");
  const resolution = completed.filter((row) => row.resolutionSource !== null);
  return {
    date, runs: rows.length, completedRuns: completed.length, verifiedRuns, verificationRate: ratio(verifiedRuns, completed.length),
    inputTokens: sumCompleteInteger(tokenRows, "inputTokens"),
    cachedInputTokens: sumCompleteInteger(tokenRows, "cachedInputTokens"),
    outputTokens: sumCompleteInteger(tokenRows, "outputTokens"),
    totalTokens: tokenRows.length ? tokenRows.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0) : null,
    aiCostUsd: costRows.length ? decimalSum(costRows.map((row) => row.llmCostUsd)).toFixed() : null,
    tokenReportingRuns: tokenRows.length, costReportingRuns: costRows.length,
    schemaAvoidedRuns: schema.filter((row) => row.schemaAvoided).length, schemaAvoidanceEligibleRuns: schema.length,
    contextEscalatedRuns: context.filter((row) => row.contextEscalated).length, contextEscalationEligibleRuns: context.length,
    modelEscalatedRuns: model.filter((row) => row.modelEscalated).length, modelEscalationEligibleRuns: model.length,
    memoryReusedRuns: memory.filter((row) => row.failureMemoryReused).length, memoryEligibleRuns: memory.length,
    zeroLlmRuns: resolution.filter((row) => row.resolutionSource === "verified_failure_memory" && row.llmCallCount === 0).length,
    resolutionSourceReportingRuns: resolution.length,
  };
}

function tierDistribution(rows: AnalyticsRow[], key: "initialModelTier" | "finalModelTier"): TierDistribution[] {
  const reported = rows.filter((row) => row[key] !== null);
  const counts = new Map<string, number>();
  for (const row of reported) counts.set(row[key]!.toUpperCase(), (counts.get(row[key]!.toUpperCase()) ?? 0) + 1);
  return [...counts].map(([tier, runs]) => ({ tier, runs, rate: runs / reported.length })).sort((a, b) => b.runs - a.runs);
}

function memoryStatistics(rows: AnalyticsRow[]) {
  const reused = rows.filter((row) => row.failureMemoryReused === true);
  const freshReported = reused.filter((row) => row.freshVerificationPassed !== null);
  return {
    reusedRuns: reused.length,
    staleHits: rows.filter((row) => row.failureMemoryStatus?.toLowerCase().includes("stale")).length,
    freshVerifyPassed: freshReported.filter((row) => row.freshVerificationPassed === true).length,
    freshVerifyReported: freshReported.length,
    zeroLlmRuns: rows.filter((row) => row.resolutionSource === "verified_failure_memory" && row.llmCallCount === 0).length,
  };
}

function isCompletedDiagnosis(row: AnalyticsRow) { return row.status === AgentRunStatus.COMPLETED && isDiagnosableUsageStatus(row.verificationStatus); }
function ratio(numerator: number, denominator: number) { return denominator ? numerator / denominator : null; }
function sumCompleteInteger(rows: AnalyticsRow[], key: "inputTokens" | "cachedInputTokens" | "outputTokens") { return rows.length && rows.every((row) => row[key] !== null) ? rows.reduce((sum, row) => sum + row[key]!, 0) : null; }
function decimalSum(values: Array<Prisma.Decimal | number | string | null>) { return values.reduce<Prisma.Decimal>((sum, value) => value === null ? sum : sum.add(String(value)), new Prisma.Decimal(0)); }
function shiftUtcDays(date: Date, days: number) { const shifted = new Date(date); shifted.setUTCDate(shifted.getUTCDate() + days); return shifted; }
function utcDateKey(date: Date) { return date.toISOString().slice(0, 10); }
function dateKeys(start: Date, end: Date) { const keys: string[] = []; for (let date = new Date(start); date < end; date = shiftUtcDays(date, 1)) keys.push(utcDateKey(date)); return keys; }

const analyticsSelect = {
  id: true, repositoryId: true, repository: { select: { fullName: true } }, createdAt: true, status: true, verificationStatus: true,
  totalTokens: true, cachedInputTokens: true, inputTokens: true, outputTokens: true, llmCostUsd: true, costComplete: true, tokenCountsComplete: true,
  llmCallCount: true, llmProvider: true, requestedModel: true, reportedModel: true, initialModelTier: true, finalModelTier: true,
  schemaAvoided: true, contextEscalated: true, modelEscalated: true, failureMemoryReused: true, resolutionSource: true,
  sourceReductionRatio: true, schemaReductionRatio: true, freshVerificationPassed: true, failureMemoryStatus: true,
  historicalTokensAvoided: true, historicalCostAvoidedUsd: true,
} satisfies Prisma.AgentRunSelect;
