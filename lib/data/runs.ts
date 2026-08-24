import "server-only";

import { AgentRunStatus, Prisma, VerificationStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { LlmCallView, RunAttemptView, RunDetail, RunListItem, RunStatus, RunVerificationStatus } from "@/lib/runs/types";
import { applySafetyValues, mutationEligibilityLevels, planFailureClasses, verificationOutcomes } from "@/lib/verification-assessment";

const planFailureViewSchema = z.object({
  classification: z.enum(planFailureClasses), reasonCode: z.string(), summary: z.string(), detail: z.string(),
  sourceFile: z.string().nullable(), sourceLine: z.number().int().positive().nullable(), resourceAddress: z.string().nullable(),
  diagnosticFormat: z.enum(["terraform_json", "bounded_text"]),
});

const attemptSchema = z.object({
  attempt: z.number().int(),
  status: z.enum(["verified", "failed", "rejected", "unavailable", "skipped"]),
  failedStage: z.string().nullable().optional(),
  commands: z.record(z.string(), z.object({
    status: z.enum(["passed", "failed", "skipped", "error"]),
    durationMs: z.number().nonnegative().default(0),
    exitCode: z.number().int().nullable().default(null),
  })).default({}),
  warnings: z.array(z.string()).max(20).default([]),
  candidateSource: z.string().nullable().default(null),
  failureCategory: z.string().nullable().default(null),
  failureReasonCode: z.string().nullable().default(null),
  failureDescription: z.string().nullable().default(null),
  candidateRepresentation: z.string().nullable().default(null),
  patchConstructionStrategy: z.string().nullable().default(null),
  planFailure: planFailureViewSchema.nullable().default(null),
});

const promptContextSchema = z.object({
  gitDiffIncluded: z.boolean().nullable().default(null),
  changedLineCount: z.number().int().nonnegative().nullable().default(null),
  selectedContextCharacters: z.number().int().nonnegative().nullable().default(null),
  renderedUserPromptCharacters: z.number().int().nonnegative().nullable().default(null),
  sourceFileCount: z.number().int().nonnegative().nullable().default(null),
  sourceBlockCount: z.number().int().nonnegative().nullable().default(null),
  sections: z.record(z.string(), z.number().int().nonnegative()).default({}),
});

const safePayloadSchema = z.object({ contextTelemetry: promptContextSchema.nullable().optional() }).passthrough();
const verificationDetailsSchema = z.object({
  failed_stage: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
}).passthrough();

export interface RunFilters {
  repositoryId?: string;
  status?: RunStatus;
  date?: string;
  resource?: string;
  verificationStatus?: RunVerificationStatus;
  model?: string;
  modelEscalated?: boolean;
  contextEscalated?: boolean;
  memoryReused?: boolean;
  zeroLlm?: boolean;
  schemaAvoided?: boolean;
  resolutionSource?: string;
}

export async function listAgentRunsForUser(userId: string, filters: RunFilters = {}, take = 100): Promise<RunListItem[]> {
  const createdAt = validDateStart(filters.date);
  const rows = await db.agentRun.findMany({
    where: {
      repository: {
        installation: { userInstallations: { some: { userId } } },
        ...(filters.repositoryId ? { id: filters.repositoryId } : {}),
      },
      ...(filters.status ? { status: databaseRunStatus(filters.status) } : {}),
      ...(filters.verificationStatus ? { verificationStatus: databaseVerificationStatus(filters.verificationStatus) } : {}),
      ...(filters.model ? { OR: [{ reportedModel: filters.model }, { requestedModel: filters.model }, { model: filters.model }] } : {}),
      ...(filters.modelEscalated !== undefined ? { modelEscalated: filters.modelEscalated } : {}),
      ...(filters.contextEscalated !== undefined ? { contextEscalated: filters.contextEscalated } : {}),
      ...(filters.memoryReused !== undefined ? { failureMemoryReused: filters.memoryReused } : {}),
      ...(filters.schemaAvoided !== undefined ? { schemaAvoided: filters.schemaAvoided } : {}),
      ...(filters.resolutionSource ? { resolutionSource: filters.resolutionSource } : {}),
      ...(filters.zeroLlm === true ? { resolutionSource: "verified_failure_memory", llmCallCount: 0 } : filters.zeroLlm === false ? { NOT: { resolutionSource: "verified_failure_memory", llmCallCount: 0 } } : {}),
      ...(createdAt ? { createdAt: { gte: createdAt } } : {}),
    },
    include: { repository: { select: { fullName: true } }, publication: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(take, 1), 200),
  });
  const items = rows.map(toListItem);
  const resource = filters.resource?.trim().toLowerCase();
  return resource ? items.filter((item) => item.affectedResource?.toLowerCase().includes(resource)) : items;
}

export async function getAgentRunForUser(userId: string, id: string): Promise<RunDetail | null> {
  const row = await db.agentRun.findFirst({
    where: { id, repository: { installation: { userInstallations: { some: { userId } } } } },
    include: { repository: { select: { fullName: true } }, publication: true, patchApplications: { orderBy: { createdAt: "desc" } } },
  });
  if (!row) return null;
  const listItem = toListItem(row);
  const promptContext = safePayloadSchema.safeParse(row.safeResultPayload);
  const verificationDetails = verificationDetailsSchema.safeParse(row.verificationDetails);
  return {
    ...listItem,
    githubWorkflowName: row.githubWorkflowName,
    branch: row.branch,
    contextMode: row.contextMode.toLowerCase().replace("_", "-"),
    model: row.model,
    rootCause: row.rootCause,
    violatedConstraint: row.violatedConstraint,
    suggestedPatch: row.suggestedPatch,
    affectedResources: stringArray(row.affectedResources),
    modelConfidence: row.modelConfidence,
    evidenceScore: row.evidenceScore,
    attempts: attempts(row.attempts),
    timing: numberRecord(row.timing),
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cachedInputTokens: row.cachedInputTokens,
    reasoningTokens: row.reasoningTokens,
    llmCallCount: row.llmCallCount,
    llmLatencyMs: row.llmLatencyMs,
    llmProvider: row.llmProvider ?? row.modelProvider.toLowerCase(),
    requestedModel: row.requestedModel,
    reportedModel: row.reportedModel,
    upstreamProvider: row.upstreamProvider,
    routingMode: row.routingMode,
    maxModelTier: row.maxModelTier,
    configuredModelRouting: row.configuredModelRouting?.toLowerCase() ?? null,
    configuredMaxModelTier: row.configuredMaxModelTier?.toLowerCase() ?? null,
    configuredModelId: row.configuredModelId,
    accountAccessLevel: row.accountAccessLevel,
    modelPolicyVersion: row.modelPolicyVersion,
    catalogSyncedAt: row.catalogSyncedAt?.toISOString() ?? null,
    initialModel: row.initialModel,
    finalModel: row.finalModel,
    initialModelTier: row.initialModelTier,
    finalModelTier: row.finalModelTier,
    modelEscalated: row.modelEscalated,
    initialContextLevel: row.initialContextLevel,
    finalContextLevel: row.finalContextLevel,
    contextEscalated: row.contextEscalated,
    contextEscalationReason: row.contextEscalationReason,
    schemaRetrieved: row.schemaRetrieved,
    schemaAvoided: row.schemaAvoided,
    sourceCharactersAvailable: row.sourceCharactersAvailable,
    sourceCharactersSelected: row.sourceCharactersSelected,
    sourceReductionRatio: row.sourceReductionRatio,
    promptContext: promptContext.success ? promptContext.data.contextTelemetry ?? null : null,
    schemaCharactersAvailable: row.schemaCharactersAvailable,
    schemaCharactersSelected: row.schemaCharactersSelected,
    schemaReductionRatio: row.schemaReductionRatio,
    failureMemoryStatus: row.failureMemoryStatus,
    failureMemoryReused: row.failureMemoryReused,
    freshVerificationPassed: row.freshVerificationPassed,
    resolutionSource: row.resolutionSource,
    candidateSource: row.candidateSource,
    llmCallsAvoided: row.llmCallsAvoided,
    historicalTokensAvoided: row.historicalTokensAvoided,
    historicalCostAvoidedUsd: row.historicalCostAvoidedUsd?.toFixed() ?? null,
    agentVersion: row.agentVersion,
    verificationFailedStage: verificationDetails.success ? verificationDetails.data.failed_stage ?? null : null,
    verificationReason: verificationDetails.success ? verificationDetails.data.reason?.slice(0, 500) ?? null : null,
    llmCalls: llmCalls(row.llmCalls),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    skipReason: row.skipReason,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    publication: row.publication ? {
      status: row.publication.status.toLowerCase() as import("@/lib/publication/types").PublicationStatus,
      commentUrl: row.publication.commentUrl,
      publishedAt: row.publication.publishedAt?.toISOString() ?? null,
      errorCode: row.publication.lastErrorCode,
      errorMessage: row.publication.lastErrorMessage,
      skipReason: row.publication.skipReason,
      attemptCount: row.publication.attemptCount,
    } : null,
    patchSha256: row.patchSha256,
    verifiedAgainstCommitSha: row.verifiedAgainstCommitSha,
    patchAffectedFiles: stringArray(row.patchAffectedFiles),
    patchTerraformFilesOnly: row.patchTerraformFilesOnly,
    patchExistingFilesOnly: row.patchExistingFilesOnly,
    mutationEligible: row.mutationEligible,
    mutationEligibilityLevel: enumValue(row.mutationEligibilityLevel, mutationEligibilityLevels),
    mutationEligibilityReason: row.mutationEligibilityReason,
    verificationOutcome: enumValue(row.verificationOutcome, verificationOutcomes),
    assessmentPatchCheckPassed: row.assessmentPatchCheckPassed,
    assessmentPatchApplyPassed: row.assessmentPatchApplyPassed,
    assessmentFmtPassed: row.assessmentFmtPassed,
    assessmentInitPassed: row.assessmentInitPassed,
    assessmentValidatePassed: row.assessmentValidatePassed,
    assessmentPlanAttempted: row.assessmentPlanAttempted,
    assessmentPlanPassed: row.assessmentPlanPassed,
    assessmentFullVerificationPassed: row.assessmentFullVerificationPassed,
    applySafety: enumValue(row.applySafety, applySafetyValues),
    planFailure: normalizedPlanFailure(row),
    patchApplications: row.patchApplications.map((application) => ({
      id: application.id,
      status: application.status.toLowerCase() as import("@/lib/runs/types").PatchApplicationView["status"],
      stage: application.stage,
      requestedBy: application.requestedByDisplay,
      requestedAt: application.requestedAt.toISOString(),
      completedAt: application.completedAt?.toISOString() ?? null,
      patchSha256: application.patchSha256,
      verifiedAgainstCommitSha: application.verifiedAgainstCommitSha,
      expectedHeadSha: application.expectedHeadSha,
      headBranch: application.headBranch,
      affectedFiles: stringArray(application.affectedFiles),
      eligibilityLevel: enumValue(application.eligibilityLevel, mutationEligibilityLevels),
      verificationOutcomeAtRequest: enumValue(application.verificationOutcomeAtRequest, verificationOutcomes),
      conditionalApproval: application.conditionalApproval,
      planFailureClassAtRequest: enumValue(application.planFailureClassAtRequest, planFailureClasses),
      planFailureReasonCodeAtRequest: application.planFailureReasonCodeAtRequest,
      commitSha: application.commitSha,
      commitUrl: application.commitUrl,
      pullRequestUrl: application.pullRequestUrl,
      errorCode: application.errorCode,
      errorMessage: application.errorMessage,
      freshVerification: freshVerification(application.freshVerification),
    })),
  };
}

export async function getRunMetricsForUser(userId: string) {
  const scope = { repository: { installation: { userInstallations: { some: { userId } } } } } as const;
  const [total, verifiedFirst, verifiedAfterRetry, failed] = await Promise.all([
    db.agentRun.count({ where: scope }),
    db.agentRun.count({ where: { ...scope, verificationStatus: VerificationStatus.VERIFIED_FIRST_ATTEMPT } }),
    db.agentRun.count({ where: { ...scope, verificationStatus: VerificationStatus.VERIFIED_AFTER_RETRY } }),
    db.agentRun.count({ where: { ...scope, status: AgentRunStatus.FAILED } }),
  ]);
  const verified = verifiedFirst + verifiedAfterRetry;
  const completed = await db.agentRun.count({ where: { ...scope, status: AgentRunStatus.COMPLETED } });
  return { total, verified, verifiedAfterRetry, failed, verificationRate: completed ? Math.round((verified / completed) * 100) : 0 };
}

function toListItem(row: Prisma.AgentRunGetPayload<{ include: { repository: { select: { fullName: true } }; publication: true } }>): RunListItem {
  const resources = stringArray(row.affectedResources);
  return {
    id: row.id,
    repositoryId: row.repositoryId,
    repositoryFullName: row.repository.fullName,
    pullRequestNumber: row.pullRequestNumber,
    commitSha: row.commitSha,
    failedStage: row.failedStage,
    workerStage: row.workerStage,
    affectedResource: resources[0] ?? null,
    status: row.status.toLowerCase() as RunStatus,
    verificationStatus: row.verificationStatus.toLowerCase() as RunVerificationStatus,
    totalRuntimeMs: row.totalRuntimeMs,
    createdAt: row.createdAt.toISOString(),
    publicationStatus: row.publication?.status.toLowerCase() as import("@/lib/publication/types").PublicationStatus | undefined ?? null,
    displayModel: row.reportedModel ?? row.requestedModel ?? row.model ?? null,
    totalTokens: row.totalTokens,
    llmCostUsd: row.llmCostUsd?.toFixed() ?? null,
    costComplete: row.costComplete,
  };
}

function stringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 100) : [];
}

function attempts(value: Prisma.JsonValue | null): RunAttemptView[] {
  const parsed = z.array(attemptSchema).max(2).safeParse(value);
  return parsed.success ? parsed.data as RunAttemptView[] : [];
}

function numberRecord(value: Prisma.JsonValue | null) {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

function llmCalls(value: Prisma.JsonValue | null): LlmCallView[] {
  const schema = z.array(z.object({
    callNumber: z.number().int().positive(),
    type: z.string(),
    contextLevel: z.string().nullable(),
    provider: z.string(),
    requestedModel: z.string(),
    reportedModel: z.string().nullable(),
    upstreamProvider: z.string().nullable(),
    routingTier: z.string().nullable(),
    routingReason: z.string().nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    cachedInputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    reasoningTokens: z.number().int().nonnegative().nullable(),
    totalTokens: z.number().int().nonnegative().nullable(),
    costUsd: z.number().nonnegative().nullable(),
    latencyMs: z.number().int().nonnegative(),
    cacheHit: z.boolean().nullable(),
  })).max(100).safeParse(value);
  return schema.success ? schema.data : [];
}

function databaseRunStatus(value: RunStatus) {
  return AgentRunStatus[value.toUpperCase() as keyof typeof AgentRunStatus];
}

function databaseVerificationStatus(value: RunVerificationStatus) {
  return VerificationStatus[value.toUpperCase() as keyof typeof VerificationStatus];
}

export async function listRunModelsForUser(userId: string) {
  const rows = await db.agentRun.findMany({
    where: { repository: { installation: { userInstallations: { some: { userId } } } } },
    select: { reportedModel: true, requestedModel: true, model: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return [...new Set(rows.flatMap((row) => [row.reportedModel, row.requestedModel, row.model]).filter((value): value is string => Boolean(value)))].sort();
}

function validDateStart(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function freshVerification(value: unknown) {
  const stageSchema = z.record(z.string(), z.object({ status: z.string(), durationMs: z.number().int().nonnegative().nullable() }));
  const current = z.object({ stages: stageSchema, outcome: z.enum(verificationOutcomes).nullable(), applySafety: z.enum(applySafetyValues).nullable(), planFailure: planFailureViewSchema.nullable() }).safeParse(value);
  if (current.success) return current.data;
  const legacy = stageSchema.safeParse(value);
  return { stages: legacy.success ? legacy.data : {}, outcome: null, applySafety: null, planFailure: null };
}

function enumValue<const T extends readonly string[]>(value: string | null, values: T): T[number] | null {
  return value !== null && (values as readonly string[]).includes(value) ? value as T[number] : null;
}

function normalizedPlanFailure(row: {
  planFailureClass: string | null; planFailureReasonCode: string | null; planFailureSummary: string | null; planFailureDetail: string | null;
  planFailureSourceFile: string | null; planFailureSourceLine: number | null; planFailureResourceAddress: string | null; planDiagnosticFormat: string | null;
}) {
  const parsed = planFailureViewSchema.safeParse({
    classification: row.planFailureClass, reasonCode: row.planFailureReasonCode, summary: row.planFailureSummary, detail: row.planFailureDetail,
    sourceFile: row.planFailureSourceFile, sourceLine: row.planFailureSourceLine, resourceAddress: row.planFailureResourceAddress, diagnosticFormat: row.planDiagnosticFormat,
  });
  return parsed.success ? parsed.data : null;
}
