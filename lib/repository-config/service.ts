import type { RepositoryConfigInput, RepositoryConfigRecord } from "@/lib/repository-config/types";
import { repositoryConfigSchema } from "@/lib/validation/repository-config";

export interface RepositoryConfigurationAccess {
  repositoryId: string;
  accessible: boolean;
}

export interface RepositoryConfigurationStore {
  findAccess(userId: string, repositoryId: string): Promise<RepositoryConfigurationAccess | null>;
  upsert(repositoryId: string, config: RepositoryConfigInput): Promise<RepositoryConfigRecord>;
}

export type RepositoryConfigurationErrorCode = "repository_not_found" | "repository_access_removed";

export class RepositoryConfigurationError extends Error {
  constructor(readonly code: RepositoryConfigurationErrorCode) {
    super(code);
    this.name = "RepositoryConfigurationError";
  }
}

export async function saveRepositoryConfiguration(
  store: RepositoryConfigurationStore,
  userId: string,
  repositoryId: string,
  input: unknown,
) {
  const access = await store.findAccess(userId, repositoryId);
  if (!access) throw new RepositoryConfigurationError("repository_not_found");
  if (!access.accessible) throw new RepositoryConfigurationError("repository_access_removed");

  const config = repositoryConfigSchema.parse(input);
  return store.upsert(repositoryId, config);
}
