import { describe, expect, it } from "vitest";
import { REPOSITORY_CONFIG_DEFAULTS } from "@/lib/repository-config/constants";
import {
  RepositoryConfigurationError,
  saveRepositoryConfiguration,
  type RepositoryConfigurationAccess,
  type RepositoryConfigurationStore,
} from "@/lib/repository-config/service";
import type { RepositoryConfigInput, RepositoryConfigRecord } from "@/lib/repository-config/types";

class MemoryConfigurationStore implements RepositoryConfigurationStore {
  records = new Map<string, RepositoryConfigRecord>();

  constructor(private readonly access: Map<string, RepositoryConfigurationAccess>) {}

  async findAccess(userId: string, repositoryId: string) {
    return this.access.get(`${userId}:${repositoryId}`) ?? null;
  }

  async upsert(repositoryId: string, config: RepositoryConfigInput) {
    const previous = this.records.get(repositoryId);
    const now = new Date("2026-08-18T12:00:00.000Z");
    const record: RepositoryConfigRecord = {
      id: previous?.id ?? `config-${repositoryId}`,
      repositoryId,
      ...config,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    this.records.set(repositoryId, record);
    return record;
  }
}

function storeWithAccess(accessible = true) {
  return new MemoryConfigurationStore(new Map([
    ["user-1:repo-1", { repositoryId: "repo-1", accessible }],
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

  it("prevents an unaffiliated user from modifying a repository", async () => {
    const store = storeWithAccess();
    await expect(saveRepositoryConfiguration(store, "other-user", "repo-1", REPOSITORY_CONFIG_DEFAULTS))
      .rejects.toMatchObject({ code: "repository_not_found" } satisfies Partial<RepositoryConfigurationError>);
    expect(store.records.size).toBe(0);
  });

  it("does not allow a user from another installation to modify config", async () => {
    const store = new MemoryConfigurationStore(new Map([
      ["user-1:repo-1", { repositoryId: "repo-1", accessible: true }],
      ["user-2:repo-2", { repositoryId: "repo-2", accessible: true }],
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
    });
    await expect(saveRepositoryConfiguration(store, "user-1", "repo-1", {
      ...REPOSITORY_CONFIG_DEFAULTS,
      terraformDir: "changed",
    })).rejects.toMatchObject({ code: "repository_access_removed" } satisfies Partial<RepositoryConfigurationError>);
    expect(store.records.get("repo-1")?.terraformDir).toBe(".");
  });
});
