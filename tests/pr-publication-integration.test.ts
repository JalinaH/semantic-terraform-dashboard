import { describe, expect, it, vi } from "vitest";
import { createGitHubPrCommentPublisher } from "@/lib/github/pr-comments";
import { publishClaimedAgentRun, type PublicationStore } from "@/lib/publication/publish-agent-run";

describe("completed run to persisted PR comment integration", () => {
  it("uses a fresh mocked installation token, creates the comment, and persists publication state", async () => {
    const create = vi.fn(async () => ({ id: "44", nodeId: "node-44", url: "https://github.com/acme/infra/pull/7#issuecomment-44" }));
    const access = vi.fn(async () => ({ token: "ephemeral-installation-token", pullRequestsPermission: "write" as const, contentsPermission: "write" as const }));
    const publisher = createGitHubPrCommentPublisher({
      getAccess: access,
      getBotLogin: () => "semantic-terraform-agent-dev[bot]",
      createApi: () => ({ list: vi.fn(async () => []), update: vi.fn(), create }),
    });
    const store = integrationStore();

    const result = await publishClaimedAgentRun("publication_7", { store, github: publisher });

    expect(result).toEqual({ outcome: "published", commentUrl: "https://github.com/acme/infra/pull/7#issuecomment-44" });
    expect(access).toHaveBeenCalledWith("9001");
    expect(create).toHaveBeenCalledWith(expect.stringContaining("<!-- semantic-terraform-agent -->"));
    expect(store.markPublished).toHaveBeenCalledWith("publication_7", expect.objectContaining({ id: "44" }), []);
    expect(JSON.stringify(store.mock.calls)).not.toContain("ephemeral-installation-token");
  });
});

function integrationStore(): PublicationStore & { mock: { calls: unknown[] }; markPublished: ReturnType<typeof vi.fn> } {
  const calls: unknown[] = [];
  const markPublished = vi.fn(async (...values: unknown[]) => { calls.push(values); });
  return {
    mock: { calls },
    getTarget: vi.fn(async () => ({
      id: "publication_7",
      attemptCount: 1,
      agentRun: {
        id: "run_7",
        status: "COMPLETED",
        pullRequestNumber: 7,
        skipReason: null,
        repositoryId: "repo_1",
        createdAt: new Date("2026-08-21T10:00:00Z"),
        rootCause: "DynamoDB hash key does not match the declared attribute.",
        safeResultPayload: { status: "ok" },
        verificationStatus: "VERIFIED_FIRST_ATTEMPT",
        affectedResources: ["aws_dynamodb_table.orders"],
        violatedConstraint: "hash_key must exactly match an attribute name",
        suggestedPatch: "-hash_key = \"order\"\n+hash_key = \"order_id\"",
        modelConfidence: 0.94,
        evidenceScore: 0.88,
        attempts: [],
        repository: { accessible: true, fullName: "acme/infra", owner: "acme", name: "infra" },
        githubInstallation: { installationId: "9001", suspendedAt: null },
      },
    }) as never),
    findNewer: vi.fn(async () => null),
    markSkipped: vi.fn(async () => undefined),
    markPublished,
    markError: vi.fn(async () => ({ retry: false })),
  };
}
