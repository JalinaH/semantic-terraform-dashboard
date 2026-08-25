import { describe, expect, it } from "vitest";
import { removeRepositoryFromDashboard, type RepositoryRemovalStore } from "@/lib/repositories/removal";

class MemoryRemovalStore implements RepositoryRemovalStore {
  repositories = new Map([["user-1:repo-1", { repositoryId: "repo-1", fullName: "acme/infra" }]]);
  removals: Array<{ repositoryId: string; removedAt: Date }> = [];

  async findAccess(userId: string, repositoryId: string) {
    return this.repositories.get(`${userId}:${repositoryId}`) ?? null;
  }

  async remove(repositoryId: string, removedAt: Date) {
    this.removals.push({ repositoryId, removedAt });
    return { cancelledRuns: 2 };
  }
}

describe("repository dashboard removal", () => {
  it("soft-removes an authorized repository and reports cancelled queued runs", async () => {
    const store = new MemoryRemovalStore();
    const now = new Date("2026-08-25T12:00:00.000Z");
    await expect(removeRepositoryFromDashboard(store, "user-1", "repo-1", now)).resolves.toEqual({ repositoryId: "repo-1", fullName: "acme/infra", cancelledRuns: 2 });
    expect(store.removals).toEqual([{ repositoryId: "repo-1", removedAt: now }]);
  });

  it("does not let another user remove the repository", async () => {
    const store = new MemoryRemovalStore();
    await expect(removeRepositoryFromDashboard(store, "user-2", "repo-1")).rejects.toMatchObject({ code: "repository_not_found" });
    expect(store.removals).toHaveLength(0);
  });
});
