import policyDocument from "@/config/model-policy.json";
import type { ModelTier } from "@prisma/client";
import { MODEL_POLICY_VERSION } from "./types";

type PolicyEntry = { tier: ModelTier; enabled: boolean; recommended: boolean; priority: number };

export function getModelPolicyEntry(modelId: string): PolicyEntry | null {
  const raw = Reflect.get(policyDocument.models, modelId) as PolicyEntry | undefined;
  if (!raw || !["FREE", "ECONOMY", "BALANCED", "PREMIUM"].includes(raw.tier)) return null;
  return { tier: raw.tier, enabled: raw.enabled === true, recommended: raw.recommended === true, priority: Math.min(Math.max(raw.priority, 1), 10_000) };
}

export function getModelPolicyVersion() {
  return policyDocument.version === MODEL_POLICY_VERSION ? policyDocument.version : MODEL_POLICY_VERSION;
}
