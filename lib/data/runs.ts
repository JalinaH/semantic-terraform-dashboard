import "server-only";

import { AgentRunStatus, Prisma, VerificationStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { RunAttemptView, RunDetail, RunListItem, RunStatus, RunVerificationStatus } from "@/lib/runs/types";

const attemptSchema = z.object({
  attempt: z.number().int(),
  status: z.enum(["verified", "failed", "rejected", "unavailable", "skipped"]),
  failedStage: z.string().nullable().optional(),
  commands: z.record(z.string(), z.object({
    status: z.enum(["passed", "failed", "skipped", "error"]),
    durationMs: z.number().nonnegative().default(0),
    exitCode: z.number().int().nullable().default(null),
  })).default({}),
});

export interface RunFilters {
  repositoryId?: string;
  status?: RunStatus;
  date?: string;
  resource?: string;
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
    include: { repository: { select: { fullName: true } }, publication: true },
  });
  if (!row) return null;
  const listItem = toListItem(row);
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
    affectedResource: resources[0] ?? null,
    status: row.status.toLowerCase() as RunStatus,
    verificationStatus: row.verificationStatus.toLowerCase() as RunVerificationStatus,
    totalRuntimeMs: row.totalRuntimeMs,
    createdAt: row.createdAt.toISOString(),
    publicationStatus: row.publication?.status.toLowerCase() as import("@/lib/publication/types").PublicationStatus | undefined ?? null,
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

function databaseRunStatus(value: RunStatus) {
  return AgentRunStatus[value.toUpperCase() as keyof typeof AgentRunStatus];
}

function validDateStart(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}
