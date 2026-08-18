import { VerificationStatus } from "@prisma/client";
import { db } from "@/lib/db";

const VERIFIED_STATUSES: VerificationStatus[] = [
  VerificationStatus.VERIFIED_FIRST_ATTEMPT,
  VerificationStatus.VERIFIED_AFTER_RETRY,
];

export async function getDashboardSummary(userId: string) {
  const repositoryScope = {
    accessible: true,
    installation: { userInstallations: { some: { userId } } },
  } as const;
  const runScope = { repository: repositoryScope } as const;

  const [repositoryCount, installationCount, runCount, verifiedCount] = await Promise.all([
    db.repository.count({ where: repositoryScope }),
    db.userInstallation.count({ where: { userId } }),
    db.agentRun.count({ where: runScope }),
    db.agentRun.count({
      where: { ...runScope, verificationStatus: { in: VERIFIED_STATUSES } },
    }),
  ]);

  return {
    repositoryCount,
    installationCount,
    runCount,
    verifiedCount,
    verificationRate: runCount ? Math.round((verifiedCount / runCount) * 100) : null,
  };
}
