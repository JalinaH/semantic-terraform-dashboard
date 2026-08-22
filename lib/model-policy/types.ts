import type { ModelTier, UserAccessLevel } from "@prisma/client";

export const MODEL_POLICY_VERSION = "terrafix_model_policy_v1";
export const MODEL_TIERS: ModelTier[] = ["FREE", "ECONOMY", "BALANCED", "PREMIUM"];

export type CatalogModel = {
  provider: "openrouter";
  modelId: string;
  canonicalSlug: string | null;
  displayName: string;
  description: string | null;
  tier: ModelTier | null;
  enabled: boolean;
  recommended: boolean;
  available: boolean;
  isFree: boolean | null;
  supportsStructuredOutput: boolean;
  supportsJsonFallback: boolean;
  contextLength: number | null;
  pricingPromptPerMillion: string | null;
  pricingOutputPerMillion: string | null;
  upstreamProvider: string | null;
  priority: number;
  policyVersion: string;
  lastSeenAt: Date;
  lastSyncedAt: Date;
};

export type ModelPolicySelection = {
  modelRouting: "auto" | "fixed";
  maxModelTier: Lowercase<ModelTier>;
  fixedModelId: string | null;
};

export type UserModelAccess = {
  accessLevel: UserAccessLevel;
  maximumTier: ModelTier;
};

export type AgentModelRegistryEntry = {
  provider: "openrouter";
  model_id: string;
  tier: Lowercase<ModelTier>;
  priority: number;
  enabled: boolean;
  supports_structured_output: boolean;
  supports_json_fallback: boolean;
  supports_tools: boolean;
  max_context_tokens: number | null;
  notes: string;
};
