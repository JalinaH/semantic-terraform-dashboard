import { db } from "@/lib/db";
import { listInstallationRepositories, type GitHubRepositorySnapshot } from "@/lib/github/app";
import { GitHubIntegrationError } from "@/lib/github/errors";

export interface RepositorySyncStore {
  upsertRepository(installationDatabaseId: string, repository: GitHubRepositorySnapshot): Promise<void>;
  listAccessibleRepositoryIds(installationDatabaseId: string): Promise<string[]>;
  markRepositoriesUnavailable(installationDatabaseId: string, repositoryIds: string[]): Promise<number>;
}

export interface InstallationRepositorySource {
  listRepositories(installationId: string): Promise<GitHubRepositorySnapshot[]>;
}

interface SyncInstallationOptions {
  installationDatabaseId: string;
  installationId: string;
  source: InstallationRepositorySource;
  store: RepositorySyncStore;
}

export async function syncInstallationRepositories({
  installationDatabaseId,
  installationId,
  source,
  store,
}: SyncInstallationOptions) {
  const repositories = await source.listRepositories(installationId);
  const activeIds = new Set(repositories.map((repository) => repository.githubRepositoryId));
  const previouslyAccessible = await store.listAccessibleRepositoryIds(installationDatabaseId);

  for (const repository of repositories) {
    await store.upsertRepository(installationDatabaseId, repository);
  }

  const removedIds = previouslyAccessible.filter((repositoryId) => !activeIds.has(repositoryId));
  const removedCount = removedIds.length
    ? await store.markRepositoriesUnavailable(installationDatabaseId, removedIds)
    : 0;

  return { synchronizedCount: repositories.length, removedCount };
}

export function createPrismaRepositorySyncStore(): RepositorySyncStore {
  return {
    async upsertRepository(installationDatabaseId, repository) {
      await db.repository.upsert({
        where: { githubRepositoryId: repository.githubRepositoryId },
        update: {
          installationId: installationDatabaseId,
          owner: repository.owner,
          name: repository.name,
          fullName: repository.fullName,
          defaultBranch: repository.defaultBranch,
          private: repository.private,
          archived: repository.archived,
          accessible: true,
          removedAt: null,
        },
        create: {
          githubRepositoryId: repository.githubRepositoryId,
          installationId: installationDatabaseId,
          owner: repository.owner,
          name: repository.name,
          fullName: repository.fullName,
          defaultBranch: repository.defaultBranch,
          private: repository.private,
          archived: repository.archived,
          accessible: true,
        },
      });
    },
    async listAccessibleRepositoryIds(installationDatabaseId) {
      const repositories = await db.repository.findMany({
        where: { installationId: installationDatabaseId, accessible: true },
        select: { githubRepositoryId: true },
      });
      return repositories.map((repository) => repository.githubRepositoryId);
    },
    async markRepositoriesUnavailable(installationDatabaseId, repositoryIds) {
      const result = await db.repository.updateMany({
        where: {
          installationId: installationDatabaseId,
          githubRepositoryId: { in: repositoryIds },
        },
        data: { accessible: false, removedAt: new Date() },
      });
      return result.count;
    },
  };
}

export async function syncPersistedInstallation(installation: {
  id: string;
  installationId: string;
}) {
  try {
    return await syncInstallationRepositories({
      installationDatabaseId: installation.id,
      installationId: installation.installationId,
      source: { listRepositories: listInstallationRepositories },
      store: createPrismaRepositorySyncStore(),
    });
  } catch (error) {
    if (error instanceof GitHubIntegrationError) throw error;
    throw new GitHubIntegrationError("sync_failed", { cause: error });
  }
}
