import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { fetchPullRequestHead } from "@/lib/github/pull-requests";
import { patchApplicationMessage, validatePullRequestPreflight, validateStoredPatchArtifact } from "@/lib/patch-application/eligibility";
import type { PatchApplicationActionState, PatchApplicationErrorCode, PullRequestHeadSnapshot } from "@/lib/patch-application/types";

const configSchema = z.object({ terraformDir: z.string(), terraformVersion: z.string() }).passthrough();

export interface PatchApplicationPreflightSuccess {
  ok: true;
  runId: string;
  repositoryId: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  expectedHeadSha: string;
  patchSha256: string;
  affectedFiles: string[];
  terraformDir: string;
  terraformVersion: string;
  head: PullRequestHeadSnapshot;
}

export type PatchApplicationPreflight = PatchApplicationPreflightSuccess | { ok: false; code: PatchApplicationErrorCode; message: string };

export async function preflightPatchApplication(userId: string, agentRunId: string): Promise<PatchApplicationPreflight> {
  const run = await db.agentRun.findFirst({
    where: {
      id: agentRunId,
      repository: { accessible: true, installation: { suspendedAt: null, userInstallations: { some: { userId } } } },
    },
    include: { repository: true, githubInstallation: true, patchApplications: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  if (!run) return failure("repository_access_denied");
  const artifact = validateStoredPatchArtifact(run);
  if (!artifact.ok) return failure(artifact.code);
  const config = configSchema.safeParse(run.configSnapshot);
  if (!config.success) return failure("not_mutation_eligible");
  if (run.githubInstallation.suspendedAt) return failure("installation_unavailable");
  if (run.patchApplications.some((application) => application.status === "APPLIED" || application.status === "PENDING" || application.status === "APPLYING")) return failure("application_already_exists");
  const newer = await db.agentRun.findFirst({
    where: {
      id: { not: run.id }, repositoryId: run.repositoryId, pullRequestNumber: run.pullRequestNumber,
      status: "COMPLETED", createdAt: { gt: run.createdAt },
    }, select: { id: true }, orderBy: { createdAt: "desc" },
  });
  if (newer) return failure("superseded_run");

  let github;
  try {
    github = await fetchPullRequestHead({
      installationId: run.githubInstallation.installationId,
      owner: run.repository.owner,
      repository: run.repository.name,
      pullRequestNumber: run.pullRequestNumber!,
    });
  } catch {
    return failure("installation_unavailable");
  }
  await db.gitHubInstallation.update({ where: { id: run.githubInstallationId }, data: { contentsPermission: github.contentsPermission } });
  const githubFailure = validatePullRequestPreflight({ repositoryFullName: run.repository.fullName, expectedHeadSha: artifact.verifiedSha, contentsPermission: github.contentsPermission, head: github.snapshot });
  if (githubFailure) return failure(githubFailure);

  return {
    ok: true,
    runId: run.id,
    repositoryId: run.repositoryId,
    repositoryFullName: run.repository.fullName,
    pullRequestNumber: run.pullRequestNumber!,
    expectedHeadSha: github.snapshot.headSha,
    patchSha256: artifact.patchSha256,
    affectedFiles: artifact.affectedFiles,
    terraformDir: config.data.terraformDir,
    terraformVersion: config.data.terraformVersion,
    head: github.snapshot,
  };
}

export async function requestPatchApplication(input: {
  userId: string;
  userDisplay: string | null;
  agentRunId: string;
  submittedPatchSha256: string;
  submittedExpectedHeadSha: string;
}): Promise<PatchApplicationActionState> {
  const preflight = await preflightPatchApplication(input.userId, input.agentRunId);
  if (!preflight.ok) return preflight;
  if (preflight.patchSha256 !== input.submittedPatchSha256) return actionFailure("patch_hash_mismatch");
  if (preflight.expectedHeadSha !== input.submittedExpectedHeadSha.toLowerCase()) return actionFailure("stale_pull_request");
  try {
    const application = await db.patchApplication.create({
      data: {
        agentRunId: preflight.runId,
        repositoryId: preflight.repositoryId,
        requestedByUserId: input.userId,
        requestedByDisplay: input.userDisplay?.slice(0, 120) ?? null,
        patchSha256: preflight.patchSha256,
        expectedHeadSha: preflight.expectedHeadSha,
        verifiedAgainstCommitSha: preflight.expectedHeadSha,
        affectedFiles: preflight.affectedFiles,
        terraformDir: preflight.terraformDir,
        terraformVersion: preflight.terraformVersion,
        pullRequestNumber: preflight.pullRequestNumber,
        headBranch: preflight.head.headBranch,
        headRepositoryFullName: preflight.head.headRepositoryFullName!,
        pullRequestUrl: preflight.head.htmlUrl,
      },
    });
    return { ok: true, applicationId: application.id, message: "TerraFix is applying the verified patch." };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return actionFailure("application_already_exists");
    throw error;
  }
}

function failure(code: PatchApplicationErrorCode): PatchApplicationPreflight {
  return { ok: false, code, message: patchApplicationMessage(code) };
}

function actionFailure(code: PatchApplicationErrorCode): PatchApplicationActionState {
  return { ok: false, code, message: patchApplicationMessage(code) };
}
