import { db } from "@/lib/db";
import type { GitHubInstallationMetadata } from "@/lib/github/app";

export async function connectInstallationToUser(userId: string, metadata: GitHubInstallationMetadata) {
  return db.$transaction(async (transaction) => {
    const installation = await transaction.gitHubInstallation.upsert({
      where: { installationId: metadata.installationId },
      update: {
        accountId: metadata.accountId,
        accountLogin: metadata.accountLogin,
        accountType: metadata.accountType,
        repositorySelection: metadata.repositorySelection,
        htmlUrl: metadata.htmlUrl,
        suspendedAt: metadata.suspendedAt,
        pullRequestsPermission: metadata.pullRequestsPermission,
        contentsPermission: metadata.contentsPermission,
      },
      create: {
        installationId: metadata.installationId,
        accountId: metadata.accountId,
        accountLogin: metadata.accountLogin,
        accountType: metadata.accountType,
        repositorySelection: metadata.repositorySelection,
        htmlUrl: metadata.htmlUrl,
        suspendedAt: metadata.suspendedAt,
        pullRequestsPermission: metadata.pullRequestsPermission,
        contentsPermission: metadata.contentsPermission,
      },
    });
    await transaction.userInstallation.upsert({
      where: {
        userId_githubInstallationId: {
          userId,
          githubInstallationId: installation.id,
        },
      },
      update: { lastVerifiedAt: new Date() },
      create: { userId, githubInstallationId: installation.id },
    });
    return installation;
  });
}

export async function getInstallationForUser(userId: string, githubInstallationId: string) {
  const userInstallation = await db.userInstallation.findUnique({
    where: { userId_githubInstallationId: { userId, githubInstallationId } },
    include: { githubInstallation: true },
  });
  return userInstallation?.githubInstallation ?? null;
}

export async function listInstallationsForUser(
  userId: string,
  options: { includeInaccessible?: boolean } = {},
) {
  return db.userInstallation.findMany({
    where: { userId },
    orderBy: { githubInstallation: { accountLogin: "asc" } },
    include: {
      githubInstallation: {
        include: {
          repositories: {
            where: options.includeInaccessible ? undefined : { accessible: true },
            orderBy: { fullName: "asc" },
            include: { config: true, awsConnection: true },
          },
        },
      },
    },
  });
}
