import "server-only";

import { AgentRunStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { RepositoryRemovalStore } from "@/lib/repositories/removal";

export async function getRepositoryForUser(userId: string, repositoryId: string) {
  return db.repository.findFirst({
    where: {
      id: repositoryId,
      installation: { userInstallations: { some: { userId } } },
    },
    include: {
      config: true,
      awsConnection: true,
      installation: true,
    },
  });
}

export const prismaRepositoryRemovalStore: RepositoryRemovalStore = {
  async findAccess(userId, repositoryId) {
    const repository = await db.repository.findFirst({
      where: { id: repositoryId, installation: { userInstallations: { some: { userId } } } },
      select: { id: true, fullName: true },
    });
    return repository ? { repositoryId: repository.id, fullName: repository.fullName } : null;
  },
  async remove(repositoryId, removedAt) {
    return db.$transaction(async (transaction) => {
      await transaction.repositoryConfig.updateMany({ where: { repositoryId }, data: { enabled: false } });
      const cancelled = await transaction.agentRun.updateMany({
        where: { repositoryId, status: AgentRunStatus.QUEUED },
        data: {
          status: AgentRunStatus.CANCELLED,
          workerStage: "cancelled",
          skipReason: "repository_removed_from_dashboard",
          heartbeatAt: removedAt,
          completedAt: removedAt,
        },
      });
      await transaction.repository.update({
        where: { id: repositoryId },
        data: { accessible: false, removedAt },
      });
      return { cancelledRuns: cancelled.count };
    });
  },
};
