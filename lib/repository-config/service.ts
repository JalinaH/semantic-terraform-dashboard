import type { RepositoryConfigInput, RepositoryConfigRecord } from "@/lib/repository-config/types";
import { repositoryConfigSchema } from "@/lib/validation/repository-config";
import type { CatalogModel } from "@/lib/model-policy/types";
import { accessForLevel, validateModelSelection } from "@/lib/model-policy/access";
import type { UserAccessLevel } from "@prisma/client";

export interface RepositoryConfigurationAccess {
  repositoryId: string;
  accessible: boolean;
  accessLevel: UserAccessLevel;
  currentConfig: { modelProvider: "gemini" | "openrouter"; model: string; fixedModelId: string | null; modelPolicyVersion: string } | null;
}

export interface RepositoryConfigurationStore {
  findAccess(userId: string, repositoryId: string): Promise<RepositoryConfigurationAccess | null>;
  findModel(modelId: string): Promise<CatalogModel | null>;
  hasEligibleAutoModels(maxTier: RepositoryConfigInput["maxModelTier"]): Promise<boolean>;
  upsert(repositoryId: string, config: RepositoryConfigInput, accessLevel: UserAccessLevel): Promise<RepositoryConfigRecord>;
}

export type RepositoryConfigurationErrorCode = "repository_not_found" | "repository_access_removed" | "model_policy_invalid";

export class RepositoryConfigurationError extends Error {
  constructor(readonly code: RepositoryConfigurationErrorCode, message: string = code) {
    super(message);
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
  const legacyUnchanged = config.modelPolicyVersion === "legacy_phase8" && access.currentConfig?.modelPolicyVersion === "legacy_phase8" && access.currentConfig.modelProvider === config.modelProvider && access.currentConfig.model === config.model && access.currentConfig.fixedModelId === config.fixedModelId;
  if (!legacyUnchanged) {
    const fixedModel = config.fixedModelId ? await store.findModel(config.fixedModelId) : null;
    const policyError = validateModelSelection({ modelRouting: config.modelRouting, maxModelTier: config.maxModelTier, fixedModelId: config.fixedModelId }, accessForLevel(access.accessLevel), fixedModel);
    if (policyError) throw new RepositoryConfigurationError("model_policy_invalid", policyError);
    if (config.modelRouting === "auto" && !await store.hasEligibleAutoModels(config.maxModelTier)) throw new RepositoryConfigurationError("model_policy_invalid", "No compatible models are currently available for this routing policy.");
  }
  return store.upsert(repositoryId, config, access.accessLevel);
}
