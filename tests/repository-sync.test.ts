import { describe, expect, it } from "vitest";
import type { GitHubRepositorySnapshot } from "@/lib/github/app";
import { syncInstallationRepositories, type RepositorySyncStore } from "@/lib/github/sync";

function repository(id: string, fullName = `owner/repo-${id}`): GitHubRepositorySnapshot {
  const [owner, name] = fullName.split("/");
  return { githubRepositoryId: id, owner, name, fullName, defaultBranch: "main", private: true, archived: false };
}

class MemoryStore implements RepositorySyncStore {
  records = new Map<string, Map<string, GitHubRepositorySnapshot & { accessible: boolean }>>();

  async upsertRepository(installationDatabaseId: string, value: GitHubRepositorySnapshot) {
    const installation = this.records.get(installationDatabaseId) ?? new Map();
    installation.set(value.githubRepositoryId, { ...value, accessible: true });
    this.records.set(installationDatabaseId, installation);
  }

  async listAccessibleRepositoryIds(installationDatabaseId: string) {
    return [...(this.records.get(installationDatabaseId)?.values() ?? [])].filter((item) => item.accessible).map((item) => item.githubRepositoryId);
  }

  async markRepositoriesUnavailable(installationDatabaseId: string, repositoryIds: string[]) {
    const installation = this.records.get(installationDatabaseId);
    let count = 0;
    for (const id of repositoryIds) {
      const current = installation?.get(id);
      if (current?.accessible) {
        installation?.set(id, { ...current, accessible: false });
        count += 1;
      }
    }
    return count;
  }
}

describe("repository synchronization", () => {
  it("upserts current grants and soft-disables repositories removed at GitHub", async () => {
    const store = new MemoryStore();
    const first = await syncInstallationRepositories({ installationDatabaseId: "install_a", installationId: "1", store, source: { listRepositories: async () => [repository("1"), repository("2")] } });
    const second = await syncInstallationRepositories({ installationDatabaseId: "install_a", installationId: "1", store, source: { listRepositories: async () => [repository("2", "owner/renamed")] } });

    expect(first).toEqual({ synchronizedCount: 2, removedCount: 0 });
    expect(second).toEqual({ synchronizedCount: 1, removedCount: 1 });
    expect(store.records.get("install_a")?.get("1")?.accessible).toBe(false);
    expect(store.records.get("install_a")?.get("2")).toMatchObject({ fullName: "owner/renamed", accessible: true });
  });

  it("keeps multiple installations isolated", async () => {
    const store = new MemoryStore();
    await syncInstallationRepositories({ installationDatabaseId: "install_a", installationId: "1", store, source: { listRepositories: async () => [repository("1")] } });
    await syncInstallationRepositories({ installationDatabaseId: "install_b", installationId: "2", store, source: { listRepositories: async () => [repository("2")] } });

    expect(store.records.get("install_a")?.has("1")).toBe(true);
    expect(store.records.get("install_a")?.has("2")).toBe(false);
    expect(store.records.get("install_b")?.has("2")).toBe(true);
  });
});
