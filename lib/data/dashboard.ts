import "server-only";

import { AWSConnectionStatus } from "@prisma/client";
import { db } from "@/lib/db";

export async function getDashboardSummary(userId: string) {
  const repositoryScope = {
    accessible: true,
    installation: { userInstallations: { some: { userId } } },
  } as const;

  const [connectedCount, installationCount, configuredCount, enabledCount, requiringAwsCount] = await Promise.all([
    db.repository.count({ where: repositoryScope }),
    db.userInstallation.count({ where: { userId } }),
    db.repository.count({ where: { ...repositoryScope, config: { isNot: null } } }),
    db.repository.count({ where: { ...repositoryScope, config: { is: { enabled: true } } } }),
    db.repository.count({
      where: {
        ...repositoryScope,
        config: { is: { enabled: true } },
        OR: [
          { awsConnection: { is: null } },
          { awsConnection: { is: { status: { not: AWSConnectionStatus.CONNECTED } } } },
        ],
      },
    }),
  ]);

  return {
    connectedCount,
    installationCount,
    configuredCount,
    enabledCount,
    requiringAwsCount,
  };
}
