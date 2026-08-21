import "server-only";

import { AgentRunStatus, Prisma, PublicationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { PublicationError } from "@/lib/publication/errors";

const MAX_PUBLICATION_ATTEMPTS = 3;

export async function queueAgentRunPublication(agentRunId: string) {
  const run = await db.agentRun.findUnique({
    where: { id: agentRunId },
    select: { id: true, repositoryId: true, pullRequestNumber: true },
  });
  if (!run) return null;
  return db.agentRunPublication.upsert({
    where: { agentRunId: run.id },
    create: { agentRunId: run.id, repositoryId: run.repositoryId, pullRequestNumber: run.pullRequestNumber },
    update: {
      repositoryId: run.repositoryId,
      pullRequestNumber: run.pullRequestNumber,
      status: PublicationStatus.PENDING,
      nextAttemptAt: null,
      workerId: null,
      claimedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      skipReason: null,
    },
  });
}

export async function queueManualAgentRunPublication(userId: string, agentRunId: string) {
  const run = await db.agentRun.findFirst({
    where: {
      id: agentRunId,
      status: AgentRunStatus.COMPLETED,
      pullRequestNumber: { not: null },
      repository: {
        accessible: true,
        installation: {
          suspendedAt: null,
          userInstallations: { some: { userId } },
        },
      },
    },
    select: { id: true, repositoryId: true, pullRequestNumber: true },
  });
  if (!run) return false;
  await db.agentRunPublication.upsert({
    where: { agentRunId: run.id },
    create: { agentRunId: run.id, repositoryId: run.repositoryId, pullRequestNumber: run.pullRequestNumber },
    update: {
      status: PublicationStatus.PENDING,
      attemptCount: 0,
      nextAttemptAt: null,
      workerId: null,
      claimedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      skipReason: null,
    },
  });
  return true;
}

export async function claimNextPublication(workerId: string) {
  const claimed = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "AgentRunPublication"
    SET
      "status" = 'PUBLISHING'::"PublicationStatus",
      "workerId" = ${workerId},
      "claimedAt" = CURRENT_TIMESTAMP,
      "attemptCount" = "attemptCount" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = (
      SELECT "id"
      FROM "AgentRunPublication"
      WHERE "status" = 'PENDING'::"PublicationStatus"
        AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= CURRENT_TIMESTAMP)
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id"
  `);
  return claimed[0]?.id ?? null;
}

export async function getPublicationTarget(publicationId: string) {
  return db.agentRunPublication.findUnique({
    where: { id: publicationId },
    include: {
      agentRun: {
        include: {
          repository: true,
          githubInstallation: true,
        },
      },
    },
  });
}

export async function findNewerCompletedPullRequestRun(input: {
  repositoryId: string;
  pullRequestNumber: number;
  createdAt: Date;
  runId: string;
}) {
  return db.agentRun.findFirst({
    where: {
      id: { not: input.runId },
      repositoryId: input.repositoryId,
      pullRequestNumber: input.pullRequestNumber,
      status: AgentRunStatus.COMPLETED,
      createdAt: { gt: input.createdAt },
      rootCause: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}

export async function markPublicationSkipped(publicationId: string, reason: string) {
  await db.agentRunPublication.update({
    where: { id: publicationId },
    data: {
      status: PublicationStatus.SKIPPED,
      skipReason: reason.slice(0, 120),
      lastErrorCode: null,
      lastErrorMessage: null,
      workerId: null,
      claimedAt: null,
      nextAttemptAt: null,
    },
  });
}

export async function markPublicationPublished(publicationId: string, comment: {
  id: string;
  nodeId: string | null;
  url: string;
}, redactionWarnings: string[]) {
  await db.agentRunPublication.update({
    where: { id: publicationId },
    data: {
      status: PublicationStatus.PUBLISHED,
      externalCommentId: comment.id,
      externalCommentNodeId: comment.nodeId,
      commentUrl: comment.url,
      publishedAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
      skipReason: null,
      redactionWarnings: redactionWarnings.slice(0, 20),
      workerId: null,
      claimedAt: null,
      nextAttemptAt: null,
    },
  });
}

export async function markPublicationError(publicationId: string, error: PublicationError, attemptCount: number) {
  const retry = error.transient && attemptCount < MAX_PUBLICATION_ATTEMPTS;
  const delayMs = 5_000 * 2 ** Math.max(0, attemptCount - 1);
  await db.agentRunPublication.update({
    where: { id: publicationId },
    data: {
      status: retry ? PublicationStatus.PENDING : PublicationStatus.FAILED,
      lastErrorCode: error.code,
      lastErrorMessage: error.message.slice(0, 500),
      workerId: null,
      claimedAt: null,
      nextAttemptAt: retry ? new Date(Date.now() + delayMs) : null,
    },
  });
  return { retry };
}

export const publicationStore = {
  getTarget: getPublicationTarget,
  findNewer: findNewerCompletedPullRequestRun,
  markSkipped: markPublicationSkipped,
  markPublished: markPublicationPublished,
  markError: markPublicationError,
};
