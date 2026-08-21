import { describe, expect, it, vi } from "vitest";
import { createGitHubPrCommentPublisher } from "@/lib/github/pr-comments";

describe("GitHub PR comment idempotency", () => {
  it("creates when no marked bot comment exists", async () => {
    const api = fakeApi([]);
    const publisher = publisherWith(api);
    const result = await publisher.publish(publicationInput());
    expect(api.create).toHaveBeenCalledOnce();
    expect(api.update).not.toHaveBeenCalled();
    expect(result.url).toContain("issuecomment-2");
  });

  it("updates the existing marked app comment", async () => {
    const api = fakeApi([comment({ body: "<!-- semantic-terraform-agent --> old", authorLogin: "semantic-terraform-agent-dev[bot]", authorType: "Bot" })]);
    const publisher = publisherWith(api);
    await publisher.publish(publicationInput());
    expect(api.update).toHaveBeenCalledWith(1, "new body");
    expect(api.create).not.toHaveBeenCalled();
  });

  it("does not update a user comment containing the marker", async () => {
    const api = fakeApi([comment({ body: "<!-- semantic-terraform-agent --> forged", authorLogin: "alice", authorType: "User" })]);
    await publisherWith(api).publish(publicationInput());
    expect(api.create).toHaveBeenCalledOnce();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("fails safely when Pull requests: Write is missing", async () => {
    const api = fakeApi([]);
    const publisher = createGitHubPrCommentPublisher({
      getAccess: vi.fn(async () => ({ token: "fresh-token", pullRequestsPermission: "read" as const })),
      getBotLogin: () => "semantic-terraform-agent-dev[bot]",
      createApi: () => api,
    });
    await expect(publisher.publish(publicationInput())).rejects.toMatchObject({ code: "github_permission_missing" });
    expect(api.create).not.toHaveBeenCalled();
  });
});

function publisherWith(api: ReturnType<typeof fakeApi>) {
  return createGitHubPrCommentPublisher({
    getAccess: vi.fn(async () => ({ token: "fresh-token", pullRequestsPermission: "write" as const })),
    getBotLogin: () => "semantic-terraform-agent-dev[bot]",
    createApi: () => api,
  });
}

function publicationInput() {
  return { installationId: "9001", owner: "acme", repository: "infra", pullRequestNumber: 12, body: "new body" };
}

function comment(overrides: Record<string, string | number | null> = {}) {
  return { id: "1", numericId: 1, nodeId: "node-1", url: "https://github.com/acme/infra/pull/12#issuecomment-1", body: null, authorLogin: null, authorType: null, ...overrides };
}

function fakeApi(comments: ReturnType<typeof comment>[]) {
  return {
    list: vi.fn(async () => comments),
    update: vi.fn(async () => ({ id: "1", nodeId: "node-1", url: "https://github.com/acme/infra/pull/12#issuecomment-1" })),
    create: vi.fn(async () => ({ id: "2", nodeId: "node-2", url: "https://github.com/acme/infra/pull/12#issuecomment-2" })),
  };
}
