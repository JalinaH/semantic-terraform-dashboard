import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicationError } from "@/lib/publication/errors";
import { publishClaimedAgentRun, type PublicationStore } from "@/lib/publication/publish-agent-run";

const previousOrigin = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = previousOrigin;
});

describe("publication lifecycle", () => {
  it("publishes a completed PR run and persists the canonical GitHub URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://dashboard.example.test";
    const store = memoryStore(target());
    const github = { publish: vi.fn(async (input) => {
      expect(input.body).toContain("https://dashboard.example.test/runs/run_1");
      return { id: "123", nodeId: "node-123", url: "https://github.com/acme/infra/pull/12#issuecomment-123" };
    }) };
    const result = await publishClaimedAgentRun("publication_1", { store, github });
    expect(result.outcome).toBe("published");
    expect(store.markPublished).toHaveBeenCalledWith("publication_1", expect.objectContaining({ id: "123" }), []);
  });

  it("skips direct pushes instead of creating a pull request", async () => {
    const store = memoryStore(target({ pullRequestNumber: null }));
    const github = { publish: vi.fn() };
    const result = await publishClaimedAgentRun("publication_1", { store, github });
    expect(result).toEqual({ outcome: "skipped", reason: "no_pull_request" });
    expect(store.markSkipped).toHaveBeenCalledWith("publication_1", "no_pull_request");
    expect(github.publish).not.toHaveBeenCalled();
  });

  it("prevents an older run from overwriting a newer completed run", async () => {
    const store = memoryStore(target());
    store.findNewer = vi.fn(async () => ({ id: "newer_run" }));
    const github = { publish: vi.fn() };
    const result = await publishClaimedAgentRun("publication_1", { store, github });
    expect(result).toEqual({ outcome: "skipped", reason: "superseded_by_newer_run" });
    expect(github.publish).not.toHaveBeenCalled();
  });

  it("never publishes an untrusted fork result", async () => {
    const store = memoryStore(target({ skipReason: "fork_pr_untrusted" }));
    const github = { publish: vi.fn() };
    const result = await publishClaimedAgentRun("publication_1", { store, github });
    expect(result).toEqual({ outcome: "skipped", reason: "fork_pr_untrusted" });
    expect(github.publish).not.toHaveBeenCalled();
  });

  it("classifies removed repository access without exposing GitHub details", async () => {
    const store = memoryStore(target({ accessible: false }));
    store.markError = vi.fn(async () => ({ retry: false }));
    const result = await publishClaimedAgentRun("publication_1", { store, github: { publish: vi.fn() } });
    expect(result).toEqual({ outcome: "failed", errorCode: "installation_removed" });
  });

  it("retries transient API failures separately from agent execution", async () => {
    const store = memoryStore(target({ publicationAttemptCount: 1 }));
    const github = { publish: vi.fn(async () => { throw new PublicationError("github_rate_limited", true); }) };
    const result = await publishClaimedAgentRun("publication_1", { store, github });
    expect(result).toEqual({ outcome: "retry", errorCode: "github_rate_limited" });
    expect(store.markError).toHaveBeenCalledWith("publication_1", expect.objectContaining({ code: "github_rate_limited" }), 1);
  });

  it("fails publication without changing the completed AgentRun", async () => {
    const store = memoryStore(target());
    store.markError = vi.fn(async () => ({ retry: false }));
    const result = await publishClaimedAgentRun("publication_1", {
      store,
      github: { publish: vi.fn(async () => { throw new PublicationError("github_permission_missing"); }) },
    });
    expect(result).toEqual({ outcome: "failed", errorCode: "github_permission_missing" });
    expect(store.markPublished).not.toHaveBeenCalled();
  });
});

function target(overrides: { pullRequestNumber?: number | null; publicationAttemptCount?: number; skipReason?: string | null; accessible?: boolean } = {}) {
  return {
    id: "publication_1",
    attemptCount: overrides.publicationAttemptCount ?? 1,
    agentRun: {
      id: "run_1",
      status: "COMPLETED",
      pullRequestNumber: overrides.pullRequestNumber === undefined ? 12 : overrides.pullRequestNumber,
      skipReason: overrides.skipReason ?? null,
      repositoryId: "repo_1",
      createdAt: new Date("2026-08-21T10:00:00Z"),
      rootCause: "The hash key does not match the declared attribute.",
      safeResultPayload: { status: "ok" },
      verificationStatus: "VERIFIED_FIRST_ATTEMPT",
      affectedResources: ["aws_dynamodb_table.orders"],
      violatedConstraint: "hash key must match an attribute",
      suggestedPatch: "-hash_key = \"bad\"\n+hash_key = \"id\"",
      modelConfidence: 0.9,
      evidenceScore: 0.8,
      attempts: [],
      repository: { accessible: overrides.accessible ?? true, fullName: "acme/infra", owner: "acme", name: "infra" },
      githubInstallation: { installationId: "9001", suspendedAt: null },
    },
  };
}

function memoryStore(value: ReturnType<typeof target>): PublicationStore & Record<keyof PublicationStore, ReturnType<typeof vi.fn>> {
  return {
    getTarget: vi.fn(async () => value as never),
    findNewer: vi.fn(async () => null),
    markSkipped: vi.fn(async () => undefined),
    markPublished: vi.fn(async () => undefined),
    markError: vi.fn(async (_id, error, attemptCount) => ({ retry: error.transient && attemptCount < 3 })),
  };
}
