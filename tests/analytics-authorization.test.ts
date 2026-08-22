import { beforeEach, describe, expect, it, vi } from "vitest";

const { findRepositories, findRuns } = vi.hoisted(() => ({ findRepositories: vi.fn(), findRuns: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { repository: { findMany: findRepositories }, agentRun: { findMany: findRuns } } }));

import { getUsageAnalytics } from "@/lib/analytics/trends";

describe("Phase 8 analytics authorization", () => {
  beforeEach(() => { findRepositories.mockReset(); findRuns.mockReset(); });

  it("denies an inaccessible repository filter before querying telemetry", async () => {
    findRepositories.mockResolvedValue([{ id: "repo-a", fullName: "alice/infra" }]);
    await expect(getUsageAnalytics({ userId: "user-a", period: "30d", repositoryId: "repo-b" })).resolves.toBeNull();
    expect(findRuns).not.toHaveBeenCalled();
  });

  it("scopes both trend and model-option queries through the authenticated user's installations", async () => {
    findRepositories.mockResolvedValue([{ id: "repo-a", fullName: "alice/infra" }]);
    findRuns.mockResolvedValue([]);
    await getUsageAnalytics({ userId: "user-a", period: "30d", repositoryId: "repo-a" });
    expect(findRuns).toHaveBeenCalledTimes(2);
    for (const [query] of findRuns.mock.calls) {
      expect(query.where.repository).toMatchObject({ installation: { userInstallations: { some: { userId: "user-a" } } } });
    }
    const telemetryQuery = findRuns.mock.calls.find(([query]) => query.select.totalTokens);
    expect(telemetryQuery?.[0].where.repository.id).toBe("repo-a");
  });

  it("rejects a model query value that is not present in accessible telemetry", async () => {
    findRepositories.mockResolvedValue([{ id: "repo-a", fullName: "alice/infra" }]);
    findRuns.mockResolvedValueOnce([{ reportedModel: "provider/model-a", requestedModel: "openrouter/free", model: "configured" }]);
    await expect(getUsageAnalytics({ userId: "user-a", period: "7d", model: "provider/private-model" })).resolves.toBeNull();
    expect(findRuns).toHaveBeenCalledTimes(1);
  });
});
