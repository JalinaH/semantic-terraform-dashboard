import { describe, expect, it } from "vitest";
import { REPOSITORY_CONFIG_DEFAULTS } from "@/lib/repository-config/constants";
import {
  RepositoryConfigurationError,
  saveRepositoryConfiguration,
  type RepositoryConfigurationAccess,
  type RepositoryConfigurationStore,
} from "@/lib/repository-config/service";
import type { RepositoryConfigInput, RepositoryConfigRecord } from "@/lib/repository-config/types";
import type { CatalogModel } from "@/lib/model-policy/types";

class MemoryConfigurationStore implements RepositoryConfigurationStore {
  records = new Map<string, RepositoryConfigRecord>();

  constructor(private readonly access: Map<string, RepositoryConfigurationAccess>) {}

  async findAccess(userId: string, repositoryId: string) {
    return this.access.get(`${userId}:${repositoryId}`) ?? null;
  }

  async findModel(modelId: string): Promise<CatalogModel | null> {
    if (modelId === "openrouter/free") return freeModel;
    if (modelId === "openai/premium") return { ...freeModel, modelId, tier: "PREMIUM", isFree: false };
    if (modelId === "openrouter/disabled") return { ...freeModel, modelId, enabled: false };
    if (modelId === "openrouter/incompatible") return { ...freeModel, modelId, supportsStructuredOutput: false, supportsJsonFallback: false };
    return null;
  }

  async hasEligibleAutoModels() { return true; }

  async upsert(repositoryId: string, config: RepositoryConfigInput, accessLevel: "FREE" | "PRO" | "ADVANCED") {
    const previous = this.records.get(repositoryId);
    const now = new Date("2026-08-18T12:00:00.000Z");
    const record: RepositoryConfigRecord = {
      id: previous?.id ?? `config-${repositoryId}`,
      repositoryId,
      ...config,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      accessLevelSnapshot: accessLevel,
    };
    this.records.set(repositoryId, record);
    return record;
  }
}

function storeWithAccess(accessible = true) {
  return new MemoryConfigurationStore(new Map([
    ["user-1:repo-1", { repositoryId: "repo-1", accessible, accessLevel: "FREE", currentConfig: null }],
  ]));
}

describe("repository configuration service", () => {
  it("creates the first configuration", async () => {
    const store = storeWithAccess();
    const saved = await saveRepositoryConfiguration(store, "user-1", "repo-1", REPOSITORY_CONFIG_DEFAULTS);
    expect(saved.repositoryId).toBe("repo-1");
    expect(store.records.size).toBe(1);
  });

  it("updates an existing configuration without creating another record", async () => {
    const store = storeWithAccess();
    const first = await saveRepositoryConfiguration(store, "user-1", "repo-1", REPOSITORY_CONFIG_DEFAULTS);
    const updated = await saveRepositoryConfiguration(store, "user-1", "repo-1", {
      ...REPOSITORY_CONFIG_DEFAULTS,
      terraformDir: "infrastructure",
      contextMode: "schema-aware",
    });
    expect(updated.id).toBe(first.id);
    expect(updated.terraformDir).toBe("infrastructure");
    expect(store.records.size).toBe(1);
  });

  it("persists a disabled configuration", async () => {
    const store = storeWithAccess();
    const saved = await saveRepositoryConfiguration(store, "user-1", "repo-1", {
      ...REPOSITORY_CONFIG_DEFAULTS,
      enabled: false,
    });
    expect(saved.enabled).toBe(false);
  });

  it("accepts an allowed fixed free model", async () => {
    const saved = await saveRepositoryConfiguration(storeWithAccess(), "user-1", "repo-1", { ...REPOSITORY_CONFIG_DEFAULTS, modelRouting: "fixed", fixedModelId: "openrouter/free", model: "openrouter/free" });
    expect(saved.fixedModelId).toBe("openrouter/free");
  });

  it.each([
    { ...REPOSITORY_CONFIG_DEFAULTS, maxModelTier: "premium" },
    { ...REPOSITORY_CONFIG_DEFAULTS, modelRouting: "fixed", fixedModelId: "openai/premium", model: "openai/premium" },
    { ...REPOSITORY_CONFIG_DEFAULTS, modelRouting: "fixed", fixedModelId: "openrouter/disabled", model: "openrouter/disabled" },
    { ...REPOSITORY_CONFIG_DEFAULTS, modelRouting: "fixed", fixedModelId: "openrouter/incompatible", model: "openrouter/incompatible" },
  ] as const)("rejects crafted or unavailable model policy", async (input) => {
    await expect(saveRepositoryConfiguration(storeWithAccess(), "user-1", "repo-1", input)).rejects.toMatchObject({ code: "model_policy_invalid" });
  });

  it("prevents an unaffiliated user from modifying a repository", async () => {
    const store = storeWithAccess();
    await expect(saveRepositoryConfiguration(store, "other-user", "repo-1", REPOSITORY_CONFIG_DEFAULTS))
      .rejects.toMatchObject({ code: "repository_not_found" } satisfies Partial<RepositoryConfigurationError>);
    expect(store.records.size).toBe(0);
  });

  it("does not allow a user from another installation to modify config", async () => {
    const store = new MemoryConfigurationStore(new Map([
      ["user-1:repo-1", { repositoryId: "repo-1", accessible: true, accessLevel: "FREE", currentConfig: null }],
      ["user-2:repo-2", { repositoryId: "repo-2", accessible: true, accessLevel: "FREE", currentConfig: null }],
    ]));
    await expect(saveRepositoryConfiguration(store, "user-2", "repo-1", REPOSITORY_CONFIG_DEFAULTS))
      .rejects.toMatchObject({ code: "repository_not_found" } satisfies Partial<RepositoryConfigurationError>);
  });

  it("preserves but blocks configuration when GitHub access was removed", async () => {
    const store = storeWithAccess(false);
    store.records.set("repo-1", {
      id: "config-repo-1",
      repositoryId: "repo-1",
      ...REPOSITORY_CONFIG_DEFAULTS,
      createdAt: new Date(),
      updatedAt: new Date(),
      accessLevelSnapshot: "FREE",
    });
    await expect(saveRepositoryConfiguration(store, "user-1", "repo-1", {
      ...REPOSITORY_CONFIG_DEFAULTS,
      terraformDir: "changed",
    })).rejects.toMatchObject({ code: "repository_access_removed" } satisfies Partial<RepositoryConfigurationError>);
    expect(store.records.get("repo-1")?.terraformDir).toBe(".");
  });
});

const freeModel: CatalogModel = {
  provider: "openrouter", modelId: "openrouter/free", canonicalSlug: null, displayName: "OpenRouter Free",
  description: null, tier: "FREE", enabled: true, recommended: true, available: true, isFree: true,
  supportsStructuredOutput: true, supportsJsonFallback: true, contextLength: 128_000,
  pricingPromptPerMillion: "0", pricingOutputPerMillion: "0", upstreamProvider: "openrouter",
  priority: 10, policyVersion: "terrafix_model_policy_v1", lastSeenAt: new Date(), lastSyncedAt: new Date(),
};
