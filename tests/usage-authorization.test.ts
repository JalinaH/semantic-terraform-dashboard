import { describe, expect, it, vi } from "vitest";

const { findRepository, findRuns } = vi.hoisted(() => ({ findRepository: vi.fn(), findRuns: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { repository: { findFirst: findRepository }, agentRun: { findMany: findRuns } } }));

import { buildUsageWhere, getAuthorizedRepositoryUsage } from "@/lib/analytics/usage";

describe("usage authorization", () => {
  it("always scopes usage to installations linked to the authenticated user", () => {
    expect(buildUsageWhere("user-1", "all", "repo-1")).toMatchObject({ repository: { id: "repo-1", installation: { userInstallations: { some: { userId: "user-1" } } } } });
  });

  it("denies repository-specific usage before querying runs when the repository is inaccessible", async () => {
    findRepository.mockResolvedValueOnce(null);
    await expect(getAuthorizedRepositoryUsage("user-1", "repo-secret", "30d")).resolves.toBeNull();
    expect(findRepository).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "repo-secret" }) }));
    expect(findRuns).not.toHaveBeenCalled();
  });

  it("queries only the authorized repository for accessible usage", async () => {
    findRepository.mockResolvedValueOnce({ id: "repo-1" });
    findRuns.mockResolvedValueOnce([]);
    const result = await getAuthorizedRepositoryUsage("user-1", "repo-1", "30d");
    expect(result?.runCount).toBe(0);
    expect(findRuns).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ repository: expect.objectContaining({ id: "repo-1" }) }) }));
  });
});
