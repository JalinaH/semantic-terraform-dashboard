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
  modelProvider: z.literal("gemini"),
  model: z.string(),
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
          affectedResources: result.affectedResources,
          modelConfidence: result.modelConfidence,
          evidenceScore: result.evidenceScore,
          attempts: result.attempts,
          timing: result.timing,
          tokenUsage: result.tokenUsage,
          verificationDetails: result.verificationDetails,
          safeResultPayload: result.safeResultPayload,
          totalRuntimeMs: result.totalRuntimeMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
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
