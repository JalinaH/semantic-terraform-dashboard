import type { CatalogModel, UserModelAccess } from "@/lib/model-policy/types";
import type { RepositoryConfigInput } from "@/lib/repository-config/types";

const rank = { FREE: 0, ECONOMY: 1, BALANCED: 2, PREMIUM: 3 } as const;

export function isModelPolicyReady(config: RepositoryConfigInput | null, models: CatalogModel[], access: UserModelAccess) {
  if (!config) return false;
  if (config.modelPolicyVersion === "legacy_phase8") return true;
  const configuredTier = config.maxModelTier.toUpperCase() as keyof typeof rank;
  const eligible = models.filter((model) => model.enabled && model.available && model.tier && rank[model.tier] <= rank[configuredTier] && rank[model.tier] <= rank[access.maximumTier] && (model.supportsStructuredOutput || model.supportsJsonFallback));
  return config.modelRouting === "auto"
    ? eligible.length > 0
    : Boolean(config.fixedModelId && eligible.some((model) => model.modelId === config.fixedModelId));
}
