import "server-only";

import {
  FailureStage,
  ModelProvider,
  RepositoryContextMode,
  ModelRouting,
  ModelTier,
  type RepositoryConfig,
} from "@prisma/client";
import { db } from "@/lib/db";
import type { RepositoryConfigurationStore } from "@/lib/repository-config/service";
import type { RepositoryConfigRecord } from "@/lib/repository-config/types";
import { toRepositoryConfigInput } from "@/lib/repository-config/mapper";
import { toCatalogModel } from "@/lib/model-policy/catalog";

const contextModeToDatabase = {
  auto: RepositoryContextMode.AUTO,
  lightweight: RepositoryContextMode.LIGHTWEIGHT,
  "schema-aware": RepositoryContextMode.SCHEMA_AWARE,
} as const;

const failureStageToDatabase = {
  validate: FailureStage.VALIDATE,
  plan: FailureStage.PLAN,
} as const;

function toRecord(config: RepositoryConfig): RepositoryConfigRecord {
  return {
    id: config.id,
    repositoryId: config.repositoryId,
    ...toRepositoryConfigInput(config),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    accessLevelSnapshot: config.accessLevelSnapshot,
  };
}

export const prismaRepositoryConfigurationStore: RepositoryConfigurationStore = {
  async findAccess(userId, repositoryId) {
    const [repository, user] = await Promise.all([
      db.repository.findFirst({ where: { id: repositoryId, installation: { userInstallations: { some: { userId } } } }, select: { id: true, accessible: true, installation: { select: { suspendedAt: true } }, config: { select: { modelProvider: true, model: true, fixedModelId: true, modelPolicyVersion: true } } } }),
      db.user.findUnique({ where: { id: userId }, select: { accessLevel: true } }),
    ]);
    return repository ? { repositoryId: repository.id, accessible: repository.accessible && repository.installation.suspendedAt === null, accessLevel: user?.accessLevel ?? "FREE", currentConfig: repository.config ? { modelProvider: repository.config.modelProvider.toLowerCase() as "gemini" | "openrouter", model: repository.config.model, fixedModelId: repository.config.fixedModelId, modelPolicyVersion: repository.config.modelPolicyVersion } : null } : null;
  },

  async findModel(modelId) {
    const row = await db.modelCatalogEntry.findUnique({ where: { provider_modelId: { provider: "openrouter", modelId } } });
    return row ? toCatalogModel(row) : null;
  },

  async hasEligibleAutoModels(maxTier) {
    const tiers = (["FREE", "ECONOMY", "BALANCED", "PREMIUM"] as ModelTier[]).slice(0, ["free", "economy", "balanced", "premium"].indexOf(maxTier) + 1);
    return await db.modelCatalogEntry.count({ where: { provider: "openrouter", enabled: true, available: true, tier: { in: tiers }, OR: [{ supportsStructuredOutput: true }, { supportsJsonFallback: true }] } }) > 0;
  },

  async upsert(repositoryId, config, accessLevel) {
    const data = {
      enabled: config.enabled,
      terraformDir: config.terraformDir,
      terraformVersion: config.terraformVersion,
      modelProvider: config.modelProvider === "openrouter" ? ModelProvider.OPENROUTER : ModelProvider.GEMINI,
      model: config.modelRouting === "fixed" ? config.fixedModelId! : "openrouter/free",
      modelRouting: config.modelRouting === "auto" ? ModelRouting.AUTO : ModelRouting.FIXED,
      maxModelTier: ModelTier[config.maxModelTier.toUpperCase() as keyof typeof ModelTier],
      fixedModelId: config.fixedModelId,
      modelPolicyVersion: config.modelPolicyVersion,
      accessLevelSnapshot: accessLevel,
      contextMode: contextModeToDatabase[config.contextMode],
      maxRepairAttempts: config.maxRepairAttempts,
      triggerOnPullRequest: config.triggerOnPullRequest,
      triggerOnPush: config.triggerOnPush,
      failedStages: config.failedStages.map((stage) => failureStageToDatabase[stage]),
      workflowNames: config.workflowNames,
      workflowNamePatterns: config.workflowNamePatterns,
      terraformPathPatterns: config.terraformPathPatterns,
    };
    const saved = await db.repositoryConfig.upsert({
      where: { repositoryId },
      create: { repositoryId, ...data },
      update: data,
    });
    return toRecord(saved);
  },
};
