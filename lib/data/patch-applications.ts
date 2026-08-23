import "server-only";

import { PatchApplicationStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { FreshVerificationSummary, PatchApplicationErrorCode, PatchApplicationStage } from "@/lib/patch-application/types";
import { parseAffectedFiles } from "@/lib/patch-application/eligibility";

export interface ClaimedPatchApplication {
  id: string;
  agentRunId: string;
  repositoryId: string;
  repositoryOwner: string;
  repositoryName: string;
  repositoryFullName: string;
  repositoryAccessible: boolean;
  installationId: string;
  installationActive: boolean;
  pullRequestNumber: number;
  expectedHeadSha: string;
  verifiedAgainstCommitSha: string;
  headBranch: string;
  headRepositoryFullName: string;
  patchSha256: string;
  patch: string;
  affectedFiles: string[];
  terraformDir: string;
  terraformVersion: string;
  requestedByDisplay: string | null;
  intendedCommitSha: string | null;
  aws: { roleArn: string; externalId: string; region: string; connected: boolean } | null;
}

export async function claimNextPatchApplication(workerId: string): Promise<ClaimedPatchApplication | null> {
  const claimed = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "PatchApplication"
    SET "status" = 'APPLYING'::"PatchApplicationStatus", "stage" = 'checking_pr_head',
        "workerId" = ${workerId}, "claimedAt" = CURRENT_TIMESTAMP,
        "heartbeatAt" = CURRENT_TIMESTAMP, "startedAt" = COALESCE("startedAt", CURRENT_TIMESTAMP),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = (
      SELECT "id" FROM "PatchApplication"
      WHERE "status" = 'PENDING'::"PatchApplicationStatus"
      ORDER BY "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1
    ) RETURNING "id"
  `);
  if (!claimed[0]) return null;
  const row = await db.patchApplication.findUnique({
    where: { id: claimed[0].id },
    include: { repository: { include: { installation: true, awsConnection: true } }, agentRun: true },
  });
  const affectedFiles = parseAffectedFiles(row?.affectedFiles);
  if (!row || !row.agentRun.verifiedPatch || !affectedFiles) {
    if (row) await markPatchApplicationError(row.id, "not_mutation_eligible", "The persisted verified patch artifact is incomplete.", "REJECTED");
    return null;
  }
  const aws = row.repository.awsConnection;
  return {
    id: row.id,
    agentRunId: row.agentRunId,
    repositoryId: row.repositoryId,
    repositoryOwner: row.repository.owner,
    repositoryName: row.repository.name,
    repositoryFullName: row.repository.fullName,
    repositoryAccessible: row.repository.accessible,
    installationId: row.repository.installation.installationId,
    installationActive: row.repository.installation.suspendedAt === null,
    pullRequestNumber: row.pullRequestNumber,
    expectedHeadSha: row.expectedHeadSha,
    verifiedAgainstCommitSha: row.verifiedAgainstCommitSha,
    headBranch: row.headBranch,
    headRepositoryFullName: row.headRepositoryFullName,
    patchSha256: row.patchSha256,
    patch: row.agentRun.verifiedPatch,
    affectedFiles,
    terraformDir: row.terraformDir,
    terraformVersion: row.terraformVersion,
    requestedByDisplay: row.requestedByDisplay,
    intendedCommitSha: row.intendedCommitSha,
    aws: aws?.roleArn ? { roleArn: aws.roleArn, externalId: aws.externalId, region: aws.region, connected: aws.status === "CONNECTED" } : null,
  };
}

export async function updatePatchApplicationProgress(id: string, stage: PatchApplicationStage) {
  await db.patchApplication.updateMany({ where: { id, status: PatchApplicationStatus.APPLYING }, data: { stage, heartbeatAt: new Date() } });
}

export async function recordIntendedCommit(id: string, commitSha: string, verification: FreshVerificationSummary) {
  await db.patchApplication.updateMany({ where: { id, status: PatchApplicationStatus.APPLYING }, data: { intendedCommitSha: commitSha, freshVerification: verification as unknown as Prisma.InputJsonValue, heartbeatAt: new Date() } });
}

export async function recordFreshVerification(id: string, verification: FreshVerificationSummary) {
  await db.patchApplication.updateMany({ where: { id, status: PatchApplicationStatus.APPLYING }, data: { freshVerification: verification as unknown as Prisma.InputJsonValue, heartbeatAt: new Date() } });
}

export async function markPatchApplicationApplied(id: string, input: { commitSha: string; commitUrl: string; pullRequestUrl: string; verification?: FreshVerificationSummary }) {
  await db.$transaction(async (transaction) => {
    const application = await transaction.patchApplication.update({ where: { id }, data: {
      status: PatchApplicationStatus.APPLIED, stage: "completed", commitSha: input.commitSha,
      intendedCommitSha: input.commitSha, commitUrl: input.commitUrl, pullRequestUrl: input.pullRequestUrl,
      ...(input.verification ? { freshVerification: input.verification as unknown as Prisma.InputJsonValue } : {}), errorCode: null, errorMessage: null,
      heartbeatAt: new Date(), completedAt: new Date(), workerId: null,
    } });
    await transaction.agentRunPublication.updateMany({ where: { agentRunId: application.agentRunId }, data: {
      status: "PENDING", attemptCount: 0, nextAttemptAt: null, workerId: null, claimedAt: null,
      lastErrorCode: null, lastErrorMessage: null, skipReason: null,
    } });
  });
}

export async function markPatchApplicationError(id: string, code: PatchApplicationErrorCode, message: string, status: "STALE" | "REJECTED" | "FAILED") {
  await db.patchApplication.updateMany({ where: { id, status: PatchApplicationStatus.APPLYING }, data: {
    status, stage: "completed", errorCode: code, errorMessage: message.slice(0, 500),
    heartbeatAt: new Date(), completedAt: new Date(), workerId: null,
  } });
}

export async function recoverStalePatchApplications(staleBefore: Date) {
  const result = await db.patchApplication.updateMany({
    where: { status: PatchApplicationStatus.APPLYING, heartbeatAt: { lt: staleBefore } },
    data: { status: PatchApplicationStatus.PENDING, stage: "queued", workerId: null, claimedAt: null },
  });
  return result.count;
}

export const prismaPatchApplicationStore = {
  updateProgress: updatePatchApplicationProgress,
  recordFreshVerification,
  recordIntendedCommit,
  markApplied: markPatchApplicationApplied,
  markError: markPatchApplicationError,
};
