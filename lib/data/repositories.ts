import "server-only";

import { db } from "@/lib/db";

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
      agentRuns: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
}
