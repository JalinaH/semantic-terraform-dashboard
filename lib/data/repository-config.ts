import "server-only";

import {
  FailureStage,
  ModelProvider,
  RepositoryContextMode,
  type RepositoryConfig,
} from "@prisma/client";
import { db } from "@/lib/db";
import type { RepositoryConfigurationStore } from "@/lib/repository-config/service";
import type { RepositoryConfigRecord } from "@/lib/repository-config/types";
import { toRepositoryConfigInput } from "@/lib/repository-config/mapper";

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
  };
}

export const prismaRepositoryConfigurationStore: RepositoryConfigurationStore = {
  async findAccess(userId, repositoryId) {
    return db.repository.findFirst({
      where: {
        id: repositoryId,
        installation: { userInstallations: { some: { userId } } },
      },
      select: { id: true, accessible: true },
    }).then((repository) => repository ? {
      repositoryId: repository.id,
      accessible: repository.accessible,
    } : null);
  },

  async upsert(repositoryId, config) {
    const data = {
      enabled: config.enabled,
      terraformDir: config.terraformDir,
      terraformVersion: config.terraformVersion,
      modelProvider: ModelProvider.GEMINI,
      model: config.model,
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
