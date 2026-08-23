import "server-only";

import { Prisma, type ModelCatalogEntry, type ModelTier } from "@prisma/client";
import { db } from "@/lib/db";
import { fetchOpenRouterCatalog, OpenRouterCatalogError, type NormalizedOpenRouterModel } from "@/lib/openrouter/catalog";
import { getUserModelAccess, modelAllowed } from "./access";
import { getModelPolicyEntry, getModelPolicyVersion } from "./policy";
import type { CatalogModel } from "./types";

export function applyTerraFixModelPolicy(model: NormalizedOpenRouterModel, now: Date): CatalogModel {
  const policy = getModelPolicyEntry(model.modelId);
  const tier = policy?.tier ?? null;
  const compatible = model.supportsStructuredOutput || model.supportsJsonFallback;
  const freeTierIsAuthoritative = tier !== "FREE" || model.isFree === true;
  return { ...model, tier, enabled: Boolean(policy?.enabled && compatible && freeTierIsAuthoritative), recommended: Boolean(policy?.recommended), available: true, priority: policy?.priority ?? 100, policyVersion: getModelPolicyVersion(), lastSeenAt: now, lastSyncedAt: now };
}

export async function syncOpenRouterCatalog(options: { apiKey?: string; fetcher?: typeof fetch; now?: Date } = {}) {
  const now = options.now ?? new Date();
  try {
    const normalized = await fetchOpenRouterCatalog({ apiKey: options.apiKey ?? process.env.OPENROUTER_API_KEY, fetcher: options.fetcher });
    if (!normalized.models.length) throw new OpenRouterCatalogError("invalid_response", "OpenRouter returned no valid models.");
    const models = normalized.models.map((model) => applyTerraFixModelPolicy(model, now));
    await db.$transaction(async (transaction) => {
      await transaction.modelCatalogEntry.deleteMany({ where: { provider: "openrouter" } });
      await transaction.modelCatalogEntry.createMany({ data: models.map(catalogData) });
      await transaction.modelCatalogSync.upsert({ where: { provider: "openrouter" }, create: { provider: "openrouter", lastAttemptAt: now, lastSuccessfulAt: now, modelsReceived: normalized.received, modelsNormalized: models.length, modelsEnabled: models.filter((model) => model.enabled).length }, update: { lastAttemptAt: now, lastSuccessfulAt: now, lastErrorCode: null, lastErrorMessage: null, modelsReceived: normalized.received, modelsNormalized: models.length, modelsEnabled: models.filter((model) => model.enabled).length } });
    }, { maxWait: 10_000, timeout: 60_000 });
    return { received: normalized.received, normalized: models.length, rejected: normalized.rejected, enabled: models.filter((model) => model.enabled).length, free: models.filter((model) => model.enabled && model.isFree === true).length, lastSuccessfulAt: now };
  } catch (error) {
    const safe = error instanceof OpenRouterCatalogError ? error : new OpenRouterCatalogError("unavailable", "OpenRouter catalog synchronization failed.");
    await db.modelCatalogSync.upsert({ where: { provider: "openrouter" }, create: { provider: "openrouter", lastAttemptAt: now, lastErrorCode: safe.code, lastErrorMessage: safe.message.slice(0, 300) }, update: { lastAttemptAt: now, lastErrorCode: safe.code, lastErrorMessage: safe.message.slice(0, 300) } });
    throw safe;
  }
}

export async function getCatalogViewForUser(userId: string) {
  const [access, rows, sync] = await Promise.all([
    getUserModelAccess(userId),
    db.modelCatalogEntry.findMany({ where: { provider: "openrouter" }, orderBy: [{ enabled: "desc" }, { tier: "asc" }, { priority: "asc" }, { displayName: "asc" }], take: 500 }),
    db.modelCatalogSync.findUnique({ where: { provider: "openrouter" } }),
  ]);
  const pricingMayBeStale = !sync?.lastSuccessfulAt || Date.now() - sync.lastSuccessfulAt.getTime() > 7 * 24 * 60 * 60 * 1_000;
  return { access, models: rows.map((row) => ({ ...toCatalogModel(row), allowed: modelAllowed(toCatalogModel(row), access) })), sync: sync ? { lastSuccessfulAt: sync.lastSuccessfulAt, lastAttemptAt: sync.lastAttemptAt, lastErrorCode: sync.lastErrorCode } : null, pricingMayBeStale };
}

export async function findCatalogModel(modelId: string) {
  if (!modelId || modelId.length > 200) return null;
  const row = await db.modelCatalogEntry.findUnique({ where: { provider_modelId: { provider: "openrouter", modelId } } });
  return row ? toCatalogModel(row) : null;
}

export async function listRegistryModels(maximumTier: ModelTier) {
  const tiers = (["FREE", "ECONOMY", "BALANCED", "PREMIUM"] as ModelTier[]).slice(0, ["FREE", "ECONOMY", "BALANCED", "PREMIUM"].indexOf(maximumTier) + 1);
  const rows = await db.modelCatalogEntry.findMany({ where: { provider: "openrouter", enabled: true, available: true, tier: { in: tiers }, OR: [{ supportsStructuredOutput: true }, { supportsJsonFallback: true }] }, orderBy: [{ tier: "asc" }, { priority: "asc" }], take: 200 });
  return rows.map(toCatalogModel);
}

export function toCatalogModel(row: ModelCatalogEntry): CatalogModel {
  return { provider: "openrouter", modelId: row.modelId, canonicalSlug: row.canonicalSlug, displayName: row.displayName, description: row.description, tier: row.tier, enabled: row.enabled, recommended: row.recommended, available: row.available, isFree: row.isFree, supportsStructuredOutput: row.supportsStructuredOutput, supportsJsonFallback: row.supportsJsonFallback, contextLength: row.contextLength, pricingPromptPerMillion: row.pricingPromptPerMillion?.toFixed() ?? null, pricingOutputPerMillion: row.pricingOutputPerMillion?.toFixed() ?? null, upstreamProvider: row.upstreamProvider, priority: row.priority, policyVersion: row.policyVersion, lastSeenAt: row.lastSeenAt, lastSyncedAt: row.lastSyncedAt };
}

function catalogData(model: CatalogModel): Prisma.ModelCatalogEntryUncheckedCreateInput {
  return { provider: model.provider, modelId: model.modelId, canonicalSlug: model.canonicalSlug, displayName: model.displayName, description: model.description, tier: model.tier, enabled: model.enabled, recommended: model.recommended, available: model.available, isFree: model.isFree, supportsStructuredOutput: model.supportsStructuredOutput, supportsJsonFallback: model.supportsJsonFallback, contextLength: model.contextLength, pricingPromptPerMillion: decimal(model.pricingPromptPerMillion), pricingOutputPerMillion: decimal(model.pricingOutputPerMillion), upstreamProvider: model.upstreamProvider, priority: model.priority, policyVersion: model.policyVersion, lastSeenAt: model.lastSeenAt, lastSyncedAt: model.lastSyncedAt };
}
function decimal(value: string | null) { return value === null ? null : new Prisma.Decimal(value); }
