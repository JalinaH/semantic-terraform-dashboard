import "server-only";

import {
  AgentRunStatus,
  Prisma,
  RepositoryContextMode,
  VerificationStatus,
} from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { SuccessfulAgentResult } from "@/lib/agent-result";
import type { ClaimedAgentRun, WorkerConfigSnapshot, WorkerRunStore } from "@/lib/worker/types";

const configSnapshotSchema = z.object({
  terraformDir: z.string(),
  terraformVersion: z.string(),
  modelProvider: z.enum(["gemini", "openrouter"]),
  model: z.string(),
  modelRouting: z.enum(["auto", "fixed"]).default("fixed"),
  maxModelTier: z.enum(["free", "economy", "balanced", "premium"]).default("free"),
  fixedModelId: z.string().nullable().optional().transform((value) => value ?? null),
  modelPolicyVersion: z.string().default("legacy_phase8"),
  accessLevel: z.enum(["FREE", "PRO", "ADVANCED"]).default("FREE"),
  modelRegistry: z.array(z.object({
    provider: z.literal("openrouter"), model_id: z.string(), tier: z.enum(["free", "economy", "balanced", "premium"]),
    priority: z.number().int(), enabled: z.boolean(), supports_structured_output: z.boolean(), supports_json_fallback: z.boolean(),
    supports_tools: z.boolean(), max_context_tokens: z.number().int().nullable(), notes: z.string(),
  })).default([]),
  catalogSyncedAt: z.string().datetime().nullable().default(null),
  contextMode: z.enum(["auto", "lightweight", "schema-aware"]),
  maxRepairAttempts: z.union([z.literal(0), z.literal(1)]),
  failedStages: z.array(z.enum(["validate", "plan"])),
});

const verificationStatusToDatabase: Record<SuccessfulAgentResult["diagnosis"]["verification_status"], VerificationStatus> = {
  verified_first_attempt: VerificationStatus.VERIFIED_FIRST_ATTEMPT,
  verified_after_retry: VerificationStatus.VERIFIED_AFTER_RETRY,
  verification_failed: VerificationStatus.VERIFICATION_FAILED,
  patch_rejected: VerificationStatus.PATCH_REJECTED,
  verification_unavailable: VerificationStatus.VERIFICATION_UNAVAILABLE,
  verification_skipped: VerificationStatus.VERIFICATION_SKIPPED,
};

export async function claimNextAgentRun(workerId: string): Promise<ClaimedAgentRun | null> {
  const claimed = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "AgentRun"
    SET
      "status" = 'RUNNING'::"AgentRunStatus",
      "workerId" = ${workerId},
      "workerStage" = 'collecting_github_context',
      "heartbeatAt" = CURRENT_TIMESTAMP,
      "claimedAt" = CURRENT_TIMESTAMP,
      "startedAt" = COALESCE("startedAt", CURRENT_TIMESTAMP),
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = (
      SELECT "id"
      FROM "AgentRun"
      WHERE "status" = 'QUEUED'::"AgentRunStatus"
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id"
  `);
  if (!claimed[0]) return null;
  const run = await db.agentRun.findUnique({
    where: { id: claimed[0].id },
    include: { repository: true, githubInstallation: true },
  });
  if (!run || !run.githubRunId) return null;
  const aws = await db.aWSConnection.findUnique({ where: { repositoryId: run.repositoryId } });
  const config = configSnapshotSchema.parse(run.configSnapshot) as WorkerConfigSnapshot;
  return {
    id: run.id,
    repositoryId: run.repositoryId,
    repositoryOwner: run.repository.owner,
    repositoryName: run.repository.name,
    repositoryFullName: run.repository.fullName,
    repositoryAccessible: run.repository.accessible,
    installationId: run.githubInstallation.installationId,
    installationActive: run.githubInstallation.suspendedAt === null,
    githubRunId: run.githubRunId,
    commitSha: run.commitSha,
    baseSha: run.baseSha,
    headSha: run.headSha,
    pullRequestNumber: run.pullRequestNumber,
    aws: aws?.roleArn ? {
      roleArn: aws.roleArn,
      externalId: aws.externalId,
      region: aws.region,
      connected: aws.status === "CONNECTED",
    } : null,
    config,
  };
}

export const prismaWorkerRunStore: WorkerRunStore = {
  async markFailed(id, code, message) {
    await db.agentRun.updateMany({
      where: { id, status: AgentRunStatus.RUNNING },
      data: {
        status: AgentRunStatus.FAILED,
        workerStage: "failed",
        heartbeatAt: new Date(),
        errorCode: code,
        errorMessage: message.slice(0, 1_000),
        completedAt: new Date(),
      },
    });
  },
  async markSkipped(id, reason) {
    await db.agentRun.updateMany({
      where: { id, status: AgentRunStatus.RUNNING },
      data: {
        status: AgentRunStatus.SKIPPED,
        workerStage: "skipped",
        heartbeatAt: new Date(),
        skipReason: reason,
        verificationStatus: VerificationStatus.VERIFICATION_SKIPPED,
        completedAt: new Date(),
      },
    });
  },
  async updateProgress(id, stage) {
    await db.agentRun.updateMany({
      where: { id, status: AgentRunStatus.RUNNING },
      data: { workerStage: stage, heartbeatAt: new Date() },
    });
  },
  async updateFailedStage(id, stage) {
    await db.agentRun.updateMany({
      where: { id, status: AgentRunStatus.RUNNING },
      data: { failedStage: stage, heartbeatAt: new Date() },
    });
  },
  async markCompleted(id, result) {
    const run = await db.agentRun.findUnique({
      where: { id },
      select: { repositoryId: true, pullRequestNumber: true },
    });
    if (!run) return;
    await db.$transaction(async (transaction) => {
      const completed = await transaction.agentRun.updateMany({
        where: { id, status: AgentRunStatus.RUNNING },
        data: {
          status: AgentRunStatus.COMPLETED,
          workerStage: "completed",
          heartbeatAt: new Date(),
          verificationStatus: verificationStatusToDatabase[result.verificationStatus],
          rootCause: result.rootCause,
          violatedConstraint: result.violatedConstraint,
          suggestedPatch: result.suggestedPatch,
          verifiedPatch: result.verifiedPatch,
          patchSha256: result.telemetry.patchSha256,
          verifiedAgainstCommitSha: result.telemetry.verifiedAgainstCommitSha,
          patchAffectedFiles: result.telemetry.patchAffectedFiles ?? Prisma.DbNull,
          patchTerraformFilesOnly: result.telemetry.patchTerraformFilesOnly,
          patchExistingFilesOnly: result.telemetry.patchExistingFilesOnly,
          patchRepositoryRelative: result.telemetry.patchRepositoryRelative,
          patchSourceFingerprint: result.telemetry.patchSourceFingerprint,
          patchCandidateSource: result.telemetry.patchCandidateSource,
          mutationEligible: result.telemetry.mutationEligible,
          mutationEligibilityLevel: result.telemetry.mutationEligibilityLevel,
          mutationEligibilityReason: result.telemetry.mutationEligibilityReason,
          mutationEligibilityDetails: result.telemetry.mutationEligibilityDetails ?? Prisma.DbNull,
          verificationOutcome: result.telemetry.verificationOutcome,
          assessmentPatchCheckPassed: result.telemetry.assessmentPatchCheckPassed,
          assessmentPatchApplyPassed: result.telemetry.assessmentPatchApplyPassed,
          assessmentFmtPassed: result.telemetry.assessmentFmtPassed,
          assessmentInitPassed: result.telemetry.assessmentInitPassed,
          assessmentValidatePassed: result.telemetry.assessmentValidatePassed,
          assessmentPlanAttempted: result.telemetry.assessmentPlanAttempted,
          assessmentPlanPassed: result.telemetry.assessmentPlanPassed,
          assessmentFullVerificationPassed: result.telemetry.assessmentFullVerificationPassed,
          applySafety: result.telemetry.applySafety,
          planFailureClass: result.telemetry.planFailureClass,
          planFailureReasonCode: result.telemetry.planFailureReasonCode,
          planFailureSummary: result.telemetry.planFailureSummary,
          planFailureDetail: result.telemetry.planFailureDetail,
          planFailureSourceFile: result.telemetry.planFailureSourceFile,
          planFailureSourceLine: result.telemetry.planFailureSourceLine,
          planFailureResourceAddress: result.telemetry.planFailureResourceAddress,
          planDiagnosticFormat: result.telemetry.planDiagnosticFormat,
          affectedResources: result.affectedResources,
          modelConfidence: result.modelConfidence,
          evidenceScore: result.evidenceScore,
          attempts: result.attempts,
          timing: result.timing,
          tokenUsage: result.tokenUsage,
          llmCalls: result.llmCalls,
          verificationDetails: result.verificationDetails,
          safeResultPayload: result.safeResultPayload,
          totalRuntimeMs: result.totalRuntimeMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cachedInputTokens: result.telemetry.cachedInputTokens,
          reasoningTokens: result.telemetry.reasoningTokens,
          totalTokens: result.telemetry.totalTokens,
          llmCallCount: result.telemetry.llmCallCount,
          llmCostUsd: decimalOrNull(result.telemetry.llmCostUsd),
          costComplete: result.telemetry.costComplete,
          tokenCountsComplete: result.telemetry.tokenCountsComplete,
          llmLatencyMs: result.telemetry.llmLatencyMs,
          llmProvider: result.telemetry.provider,
          requestedModel: result.telemetry.requestedModel,
          reportedModel: result.telemetry.reportedModel,
          upstreamProvider: result.telemetry.upstreamProvider,
          routingMode: result.telemetry.routingMode,
          maxModelTier: result.telemetry.maxModelTier,
          initialModel: result.telemetry.initialModel,
          finalModel: result.telemetry.finalModel,
          initialModelTier: result.telemetry.initialModelTier,
          finalModelTier: result.telemetry.finalModelTier,
          modelEscalated: result.telemetry.modelEscalated,
          initialContextLevel: result.telemetry.initialContextLevel,
          finalContextLevel: result.telemetry.finalContextLevel,
          contextEscalated: result.telemetry.contextEscalated,
          contextEscalationReason: result.telemetry.contextEscalationReason,
          schemaRetrieved: result.telemetry.schemaRetrieved,
          schemaAvoided: result.telemetry.schemaAvoided,
          sourceCharactersAvailable: result.telemetry.sourceCharactersAvailable,
          sourceCharactersSelected: result.telemetry.sourceCharactersSelected,
          sourceReductionRatio: result.telemetry.sourceReductionRatio,
          schemaCharactersAvailable: result.telemetry.schemaCharactersAvailable,
          schemaCharactersSelected: result.telemetry.schemaCharactersSelected,
          schemaReductionRatio: result.telemetry.schemaReductionRatio,
          failureMemoryStatus: result.telemetry.failureMemoryStatus,
          failureMemoryReused: result.telemetry.failureMemoryReused,
          freshVerificationPassed: result.telemetry.freshVerificationPassed,
          resolutionSource: result.telemetry.resolutionSource,
          candidateSource: result.telemetry.candidateSource,
          llmCallsAvoided: result.telemetry.llmCallsAvoided,
          historicalTokensAvoided: result.telemetry.historicalTokensAvoided,
          historicalCostAvoidedUsd: decimalOrNull(result.telemetry.historicalCostAvoidedUsd),
          agentVersion: result.telemetry.agentVersion,
          completedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      if (completed.count !== 1) return;
      await transaction.agentRunPublication.upsert({
        where: { agentRunId: id },
        create: {
          agentRunId: id,
          repositoryId: run.repositoryId,
          pullRequestNumber: run.pullRequestNumber,
        },
        update: {
          repositoryId: run.repositoryId,
          pullRequestNumber: run.pullRequestNumber,
          status: "PENDING",
          nextAttemptAt: null,
          workerId: null,
          claimedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          skipReason: null,
        },
      });
    });
  },
};

export async function recoverStaleAgentRuns(staleBefore: Date) {
  const recovered = await db.agentRun.updateMany({
    where: {
      status: AgentRunStatus.RUNNING,
      OR: [
        { heartbeatAt: { lt: staleBefore } },
        { heartbeatAt: null, claimedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: AgentRunStatus.FAILED,
      workerStage: "failed",
      heartbeatAt: new Date(),
      errorCode: "worker_stale",
      errorMessage: WORKER_STALE_MESSAGE,
      completedAt: new Date(),
    },
  });
  return recovered.count;
}

const WORKER_STALE_MESSAGE = "The worker stopped reporting progress before the hosted diagnosis completed.";

export function contextModeLabel(value: RepositoryContextMode) {
  return { AUTO: "auto", LIGHTWEIGHT: "lightweight", SCHEMA_AWARE: "schema-aware" }[value];
}

function decimalOrNull(value: number | null) {
  return value === null ? null : new Prisma.Decimal(String(value));
}
