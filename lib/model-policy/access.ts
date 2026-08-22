import "server-only";

import type { ModelTier, UserAccessLevel } from "@prisma/client";
import { db } from "@/lib/db";
import type { CatalogModel, ModelPolicySelection, UserModelAccess } from "./types";

export const ACCESS_LEVEL_MAX_TIER: Record<UserAccessLevel, ModelTier> = {
  FREE: "FREE",
  PRO: "BALANCED",
  ADVANCED: "PREMIUM",
};

const tierRank: Record<ModelTier, number> = { FREE: 0, ECONOMY: 1, BALANCED: 2, PREMIUM: 3 };

export async function getUserModelAccess(userId: string): Promise<UserModelAccess> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { accessLevel: true } });
  const accessLevel = user?.accessLevel ?? "FREE";
  return { accessLevel, maximumTier: ACCESS_LEVEL_MAX_TIER[accessLevel] };
}

export function accessForLevel(accessLevel: UserAccessLevel): UserModelAccess {
  return { accessLevel, maximumTier: ACCESS_LEVEL_MAX_TIER[accessLevel] };
}

export function tierAllowed(requested: ModelTier, maximum: ModelTier) {
  return tierRank[requested] <= tierRank[maximum];
}

export function modelAllowed(model: Pick<CatalogModel, "tier" | "enabled" | "available" | "supportsStructuredOutput" | "supportsJsonFallback">, access: UserModelAccess) {
  return Boolean(model.enabled && model.available && model.tier && tierAllowed(model.tier, access.maximumTier) && (model.supportsStructuredOutput || model.supportsJsonFallback));
}

export function validateModelSelection(input: ModelPolicySelection, access: UserModelAccess, fixedModel?: CatalogModel | null) {
  const requestedTier = input.maxModelTier.toUpperCase() as ModelTier;
  if (!tierAllowed(requestedTier, access.maximumTier)) return "This model tier is not available with your current TerraFix access.";
  if (input.modelRouting === "auto") return input.fixedModelId === null ? null : "Auto Optimize cannot include a fixed model.";
  if (!input.fixedModelId) return "Choose an available model.";
  if (!fixedModel || fixedModel.modelId !== input.fixedModelId || !modelAllowed(fixedModel, access)) return "This model is not available with your current TerraFix access.";
  return null;
}
