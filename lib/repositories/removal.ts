export interface RepositoryRemovalAccess {
  repositoryId: string;
  fullName: string;
}

export interface RepositoryRemovalStore {
  findAccess(userId: string, repositoryId: string): Promise<RepositoryRemovalAccess | null>;
  remove(repositoryId: string, removedAt: Date): Promise<{ cancelledRuns: number }>;
}

export class RepositoryRemovalError extends Error {
  constructor(public readonly code: "repository_not_found" | "repository_removal_failed", options?: { cause?: unknown }) {
    super(code, options);
    this.name = "RepositoryRemovalError";
  }
}

export async function removeRepositoryFromDashboard(
  store: RepositoryRemovalStore,
  userId: string,
  repositoryId: string,
  now = new Date(),
) {
  const access = await store.findAccess(userId, repositoryId);
  if (!access) throw new RepositoryRemovalError("repository_not_found");

  try {
    const result = await store.remove(access.repositoryId, now);
    return { ...access, ...result };
  } catch (error) {
    throw new RepositoryRemovalError("repository_removal_failed", { cause: error });
  }
}
