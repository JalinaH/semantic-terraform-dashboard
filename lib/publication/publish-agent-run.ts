import "server-only";

import { AgentRunStatus } from "@prisma/client";
import { z } from "zod";
import { getApplicationOrigin } from "@/lib/config";
import { githubPrCommentPublisher, type GitHubPrCommentPublisher } from "@/lib/github/pr-comments";
import { classifyGitHubPublicationError, PublicationError } from "@/lib/publication/errors";
import { MAX_PR_COMMENT_CHARS, renderAgentComment } from "@/lib/publication/render-agent-comment";
import type { PublicationAttempt } from "@/lib/publication/types";
import { publicationStore } from "@/lib/data/publications";

const attemptSchema = z.array(z.object({
  attempt: z.number().int(),
  status: z.enum(["verified", "failed", "rejected", "unavailable", "skipped"]),
  failedStage: z.string().nullable().optional(),
  commands: z.record(z.string(), z.object({ status: z.enum(["passed", "failed", "skipped", "error"]) })).default({}),
})).max(2);

type Target = NonNullable<Awaited<ReturnType<typeof publicationStore.getTarget>>>;

export interface PublicationStore {
  getTarget(publicationId: string): Promise<Target | null>;
  findNewer(input: { repositoryId: string; pullRequestNumber: number; createdAt: Date; runId: string }): Promise<{ id: string } | null>;
  markSkipped(publicationId: string, reason: string): Promise<void>;
  markPublished(publicationId: string, comment: { id: string; nodeId: string | null; url: string }, redactionWarnings: string[]): Promise<void>;
  markError(publicationId: string, error: PublicationError, attemptCount: number): Promise<{ retry: boolean }>;
}

export async function publishClaimedAgentRun(
  publicationId: string,
  dependencies: { store: PublicationStore; github: GitHubPrCommentPublisher } = {
    store: publicationStore,
    github: githubPrCommentPublisher,
  },
) {
  const target = await dependencies.store.getTarget(publicationId);
  if (!target) return { outcome: "missing" as const };
  const run = target.agentRun;

  try {
    if (run.status !== AgentRunStatus.COMPLETED) {
      await dependencies.store.markSkipped(publicationId, "run_not_completed");
      return { outcome: "skipped" as const, reason: "run_not_completed" };
    }
    if (!run.pullRequestNumber) {
      await dependencies.store.markSkipped(publicationId, "no_pull_request");
      return { outcome: "skipped" as const, reason: "no_pull_request" };
    }
    if (run.skipReason === "fork_pr_untrusted") {
      await dependencies.store.markSkipped(publicationId, "fork_pr_untrusted");
      return { outcome: "skipped" as const, reason: "fork_pr_untrusted" };
    }
    if (!run.repository.accessible || run.githubInstallation.suspendedAt) {
      throw new PublicationError("installation_removed");
    }
    if (!run.rootCause || !run.safeResultPayload || run.verificationStatus === "PENDING") {
      throw new PublicationError("invalid_run_payload");
    }

    const newer = await dependencies.store.findNewer({
      repositoryId: run.repositoryId,
      pullRequestNumber: run.pullRequestNumber,
      createdAt: run.createdAt,
      runId: run.id,
    });
    if (newer) {
      await dependencies.store.markSkipped(publicationId, "superseded_by_newer_run");
      return { outcome: "skipped" as const, reason: "superseded_by_newer_run" };
    }

    const parsedAttempts = attemptSchema.safeParse(run.attempts);
    const origin = getApplicationOrigin();
    const rendered = renderAgentComment({
      runId: run.id,
      repositoryFullName: run.repository.fullName,
      rootCause: run.rootCause,
      affectedResources: jsonStringArray(run.affectedResources),
      violatedConstraint: run.violatedConstraint,
      suggestedPatch: run.suggestedPatch,
      verificationStatus: run.verificationStatus.toLowerCase() as Parameters<typeof renderAgentComment>[0]["verificationStatus"],
      modelConfidence: run.modelConfidence,
      evidenceScore: run.evidenceScore,
      attempts: parsedAttempts.success ? parsedAttempts.data as PublicationAttempt[] : [],
      dashboardUrl: origin ? `${origin}/runs/${encodeURIComponent(run.id)}` : null,
    });
    if (rendered.body.length > MAX_PR_COMMENT_CHARS) throw new PublicationError("comment_too_large");
    const comment = await dependencies.github.publish({
      installationId: run.githubInstallation.installationId,
      owner: run.repository.owner,
      repository: run.repository.name,
      pullRequestNumber: run.pullRequestNumber,
      body: rendered.body,
    });
    await dependencies.store.markPublished(publicationId, comment, rendered.redactionWarnings);
    return { outcome: "published" as const, commentUrl: comment.url };
  } catch (error) {
    const publicationError = classifyGitHubPublicationError(error);
    const state = await dependencies.store.markError(publicationId, publicationError, target.attemptCount);
    return { outcome: state.retry ? "retry" as const : "failed" as const, errorCode: publicationError.code };
  }
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 100) : [];
}
