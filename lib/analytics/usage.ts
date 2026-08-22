import "server-only";

import { AgentRunStatus, Prisma, VerificationStatus } from "@prisma/client";
import { db } from "@/lib/db";

export type UsagePeriod = "7d" | "30d" | "all";

export interface UsageCallRow {
  callNumber?: number;
  requestedModel?: string | null;
  reportedModel?: string | null;
  routingTier?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
}

export interface UsageRow {
  id: string;
  repositoryId: string;
  repositoryFullName: string;
  status: string;
  verificationStatus: string;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  llmCostUsd: Prisma.Decimal | number | string | null;
  costComplete: boolean | null;
  tokenCountsComplete: boolean | null;
  llmCallCount: number | null;
  llmProvider: string | null;
  requestedModel: string | null;
  reportedModel: string | null;
  finalModelTier: string | null;
  schemaAvoided: boolean | null;
  contextEscalated: boolean | null;
  modelEscalated: boolean | null;
  failureMemoryReused: boolean | null;
  resolutionSource: string | null;
  llmCalls: unknown;
}

export interface UsageSummary {
  period: UsagePeriod;
  runCount: number;
  completedRunCount: number;
  verifiedFixes: number;
  verificationRate: number | null;
  totalTokens: number;
  cachedInputTokens: number;
  tokenCompleteRuns: number;
  aiSpendUsd: string;
  costCompleteRuns: number;
  averageTokensPerRun: number | null;
  averageCostPerRunUsd: string | null;
  costPerVerifiedFixUsd: string | null;
  modelCalls: number;
  modelCallReportedRuns: number;
  averageModelCallsPerRun: number | null;
  zeroLlmRuns: number;
  zeroLlmResolutionRate: number | null;
  schemaAvoidanceRate: number | null;
  schemaAvoidanceReportedRuns: number;
  contextEscalationRate: number | null;
  contextEscalationReportedRuns: number;
  modelEscalationRate: number | null;
  modelEscalationReportedRuns: number;
  memoryReuseRate: number | null;
  memoryReuseReportedRuns: number;
  repositoryBreakdown: RepositoryUsageBreakdown[];
  modelBreakdown: ModelUsageBreakdown[];
}

export interface RepositoryUsageBreakdown {
  repositoryId: string;
  repository: string;
  runs: number;
  completedRuns: number;
  tokens: number;
  tokenCompleteRuns: number;
  costUsd: string;
  costCompleteRuns: number;
  verifiedFixes: number;
  verificationRate: number | null;
  costPerVerifiedFixUsd: string | null;
  schemaAvoidanceRate: number | null;
  modelEscalationRate: number | null;
  memoryReuseRate: number | null;
}

export interface ModelUsageBreakdown {
  model: string;
  tier: string | null;
  calls: number;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
  tokenCompleteRuns: number;
  costCompleteRuns: number;
  verifiedFixes: number;
}

const verifiedStatuses = new Set<VerificationStatus>([VerificationStatus.VERIFIED_FIRST_ATTEMPT, VerificationStatus.VERIFIED_AFTER_RETRY]);
const diagnosableStatuses = new Set<VerificationStatus>([
  VerificationStatus.VERIFIED_FIRST_ATTEMPT,
  VerificationStatus.VERIFIED_AFTER_RETRY,
  VerificationStatus.VERIFICATION_FAILED,
  VerificationStatus.PATCH_REJECTED,
  VerificationStatus.VERIFICATION_UNAVAILABLE,
]);

export function isVerifiedUsageStatus(value: string) {
  return verifiedStatuses.has(value as VerificationStatus);
}

export function isDiagnosableUsageStatus(value: string) {
  return diagnosableStatuses.has(value as VerificationStatus);
}

export function parseUsagePeriod(value: string | undefined): UsagePeriod {
  return value === "7d" || value === "all" ? value : "30d";
}

export function usagePeriodStart(period: UsagePeriod, now = new Date()) {
  if (period === "all") return undefined;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (period === "7d" ? 7 : 30));
  return start;
}

export function buildUsageWhere(userId: string, period: UsagePeriod, repositoryId?: string, now = new Date()): Prisma.AgentRunWhereInput {
  const start = usagePeriodStart(period, now);
  return {
    repository: {
      ...(repositoryId ? { id: repositoryId } : {}),
      installation: { userInstallations: { some: { userId } } },
    },
    ...(start ? { createdAt: { gte: start } } : {}),
  };
}

export async function getUsageAnalyticsForUser(userId: string, period: UsagePeriod, repositoryId?: string): Promise<UsageSummary> {
  const rows = await db.agentRun.findMany({
    where: buildUsageWhere(userId, period, repositoryId),
    select: {
      id: true,
      repositoryId: true,
      repository: { select: { fullName: true } },
      status: true,
      verificationStatus: true,
      totalTokens: true,
      cachedInputTokens: true,
      inputTokens: true,
      outputTokens: true,
      llmCostUsd: true,
      costComplete: true,
      tokenCountsComplete: true,
      llmCallCount: true,
      llmProvider: true,
      requestedModel: true,
      reportedModel: true,
      finalModelTier: true,
      schemaAvoided: true,
      contextEscalated: true,
      modelEscalated: true,
      failureMemoryReused: true,
      resolutionSource: true,
    },
  });
  return calculateUsageSummary(rows.map((row) => ({ ...row, repositoryFullName: row.repository.fullName, llmCalls: null })), period);
}

export async function getAuthorizedRepositoryUsage(userId: string, repositoryId: string, period: UsagePeriod) {
  const repository = await db.repository.findFirst({
    where: { id: repositoryId, installation: { userInstallations: { some: { userId } } } },
    select: { id: true },
  });
  if (!repository) return null;
  return getUsageAnalyticsForUser(userId, period, repositoryId);
}

export function calculateUsageSummary(rows: UsageRow[], period: UsagePeriod): UsageSummary {
  const completed = rows.filter((row) => row.status === AgentRunStatus.COMPLETED && isDiagnosableUsageStatus(row.verificationStatus));
  const verified = completed.filter((row) => isVerifiedUsageStatus(row.verificationStatus));
  const tokenComplete = completed.filter((row) => row.tokenCountsComplete === true && row.totalTokens !== null);
  const costComplete = completed.filter((row) => row.costComplete === true && row.llmCostUsd !== null);
  const callReported = completed.filter((row) => row.llmCallCount !== null);
  const totalTokens = tokenComplete.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0);
  const cachedInputTokens = completed.reduce((sum, row) => sum + (row.cachedInputTokens ?? 0), 0);
  const aiSpend = sumDecimal(costComplete.map((row) => row.llmCostUsd));
  const allCostsComplete = completed.length > 0 && costComplete.length === completed.length;
  const allTokensComplete = completed.length > 0 && tokenComplete.length === completed.length;
  const modelCalls = callReported.reduce((sum, row) => sum + (row.llmCallCount ?? 0), 0);
  const zeroLlmRuns = completed.filter((row) => row.resolutionSource === "verified_failure_memory" && row.llmCallCount === 0).length;

  const byRepository = new Map<string, UsageRow[]>();
  for (const row of rows) {
    const key = `${row.repositoryId}\u0000${row.repositoryFullName}`;
    byRepository.set(key, [...(byRepository.get(key) ?? []), row]);
  }

  return {
    period,
    runCount: rows.length,
    completedRunCount: completed.length,
    verifiedFixes: verified.length,
    verificationRate: rate(verified.length, completed.length),
    totalTokens,
    cachedInputTokens,
    tokenCompleteRuns: tokenComplete.length,
    aiSpendUsd: aiSpend.toFixed(),
    costCompleteRuns: costComplete.length,
    averageTokensPerRun: allTokensComplete ? totalTokens / completed.length : null,
    averageCostPerRunUsd: allCostsComplete ? aiSpend.div(completed.length).toFixed() : null,
    costPerVerifiedFixUsd: allCostsComplete && verified.length ? aiSpend.div(verified.length).toFixed() : null,
    modelCalls,
    modelCallReportedRuns: callReported.length,
    averageModelCallsPerRun: callReported.length ? modelCalls / callReported.length : null,
    zeroLlmRuns,
    zeroLlmResolutionRate: rate(zeroLlmRuns, reported(completed, "resolutionSource").length),
    schemaAvoidanceRate: booleanRate(completed, "schemaAvoided"),
    schemaAvoidanceReportedRuns: reported(completed, "schemaAvoided").length,
    contextEscalationRate: booleanRate(completed, "contextEscalated"),
    contextEscalationReportedRuns: reported(completed, "contextEscalated").length,
    modelEscalationRate: booleanRate(completed, "modelEscalated"),
    modelEscalationReportedRuns: reported(completed, "modelEscalated").length,
    memoryReuseRate: booleanRate(completed, "failureMemoryReused"),
    memoryReuseReportedRuns: reported(completed, "failureMemoryReused").length,
    repositoryBreakdown: [...byRepository.entries()].map(([key, repositoryRows]) => repositoryBreakdown(key, repositoryRows)).sort((a, b) => b.runs - a.runs),
    modelBreakdown: modelBreakdown(completed),
  };
}

function repositoryBreakdown(key: string, rows: UsageRow[]): RepositoryUsageBreakdown {
  const [repositoryId, repository] = key.split("\u0000");
  const summary = calculateUsageSummaryWithoutBreakdowns(rows);
  return { repositoryId, repository, ...summary };
}

function calculateUsageSummaryWithoutBreakdowns(rows: UsageRow[]) {
  const completed = rows.filter((row) => row.status === AgentRunStatus.COMPLETED && isDiagnosableUsageStatus(row.verificationStatus));
  const verified = completed.filter((row) => isVerifiedUsageStatus(row.verificationStatus));
  const tokenComplete = completed.filter((row) => row.tokenCountsComplete === true && row.totalTokens !== null);
  const costComplete = completed.filter((row) => row.costComplete === true && row.llmCostUsd !== null);
  const cost = sumDecimal(costComplete.map((row) => row.llmCostUsd));
  const tokens = tokenComplete.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0);
  return {
    runs: rows.length,
    completedRuns: completed.length,
    tokens,
    tokenCompleteRuns: tokenComplete.length,
    costUsd: cost.toFixed(),
    costCompleteRuns: costComplete.length,
    verifiedFixes: verified.length,
    verificationRate: rate(verified.length, completed.length),
    costPerVerifiedFixUsd: completed.length > 0 && costComplete.length === completed.length && verified.length ? cost.div(verified.length).toFixed() : null,
    schemaAvoidanceRate: booleanRate(completed, "schemaAvoided"),
    modelEscalationRate: booleanRate(completed, "modelEscalated"),
    memoryReuseRate: booleanRate(completed, "failureMemoryReused"),
  };
}

function modelBreakdown(rows: UsageRow[]): ModelUsageBreakdown[] {
  const models = new Map<string, { tier: string | null; calls: number; input: number; output: number; cost: Prisma.Decimal; tokenCompleteRuns: number; costCompleteRuns: number; runIds: Set<string>; verifiedRunIds: Set<string> }>();
  for (const row of rows) {
    if (row.llmCallCount === null && !row.reportedModel && !row.requestedModel) continue;
    const model = row.reportedModel ?? row.requestedModel ?? "Not reported";
    const current = models.get(model) ?? { tier: row.finalModelTier, calls: 0, input: 0, output: 0, cost: new Prisma.Decimal(0), tokenCompleteRuns: 0, costCompleteRuns: 0, runIds: new Set<string>(), verifiedRunIds: new Set<string>() };
    current.runIds.add(row.id);
    current.calls += row.llmCallCount ?? 0;
    if (row.tokenCountsComplete === true) {
      current.input += row.inputTokens ?? 0;
      current.output += row.outputTokens ?? 0;
      current.tokenCompleteRuns += 1;
    }
    if (row.costComplete === true && row.llmCostUsd !== null) {
      current.cost = current.cost.add(String(row.llmCostUsd));
      current.costCompleteRuns += 1;
    }
    if (isVerifiedUsageStatus(row.verificationStatus)) current.verifiedRunIds.add(row.id);
    models.set(model, current);
  }
  return [...models.entries()].map(([model, value]) => ({ model, tier: value.tier, calls: value.calls, runs: value.runIds.size, inputTokens: value.input, outputTokens: value.output, costUsd: value.cost.toFixed(), tokenCompleteRuns: value.tokenCompleteRuns, costCompleteRuns: value.costCompleteRuns, verifiedFixes: value.verifiedRunIds.size })).sort((a, b) => b.calls - a.calls);
}

function sumDecimal(values: Array<Prisma.Decimal | number | string | null>) {
  return values.reduce<Prisma.Decimal>((sum, value) => value === null ? sum : sum.add(String(value)), new Prisma.Decimal(0));
}

function rate(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : null;
}

function reported<K extends keyof UsageRow>(rows: UsageRow[], key: K) {
  return rows.filter((row) => row[key] !== null);
}

function booleanRate<K extends "schemaAvoided" | "contextEscalated" | "modelEscalated" | "failureMemoryReused">(rows: UsageRow[], key: K) {
  const population = reported(rows, key);
  return rate(population.filter((row) => row[key] === true).length, population.length);
}
