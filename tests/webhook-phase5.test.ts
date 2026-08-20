import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleGitHubWebhookRequest } from "@/lib/webhooks/handler";
import { processWebhookDelivery, type CreateWebhookRunInput, type WebhookDeliveryStore, type WebhookRepositorySnapshot } from "@/lib/webhooks/service";
import { executionContext, repositorySnapshot, workflowRunPayload } from "@/tests/phase5-fixtures";

const secret = "webhook-test-secret";
const deliveryId = "11111111-2222-4333-8444-555555555555";

class MemoryWebhookStore implements WebhookDeliveryStore {
  deliveries = new Set<string>();
  created: CreateWebhookRunInput[] = [];
  completions: Array<{ deliveryId: string; outcome: string; skipReason?: string }> = [];
  failed: string[] = [];

  constructor(public repository: WebhookRepositorySnapshot | null = repositorySnapshot() as WebhookRepositorySnapshot) {}

  async reserve(input: { deliveryId: string }) {
    if (this.deliveries.has(input.deliveryId)) return "duplicate" as const;
    this.deliveries.add(input.deliveryId);
    return "reserved" as const;
  }
  async findRepository() { return this.repository; }
  async createRun(input: CreateWebhookRunInput) { this.created.push(input); return { id: `run_${this.created.length}` }; }
  async complete(id: string, input: { outcome: string; skipReason?: "not_terraform_change" | "workflow_not_configured" | "repository_not_ready" | "trigger_disabled" | "fork_pr_untrusted" | "unsupported_event" }) { this.completions.push({ deliveryId: id, ...input }); }
  async fail(id: string) { this.failed.push(id); }
}

const contextSource = { resolve: async () => executionContext() as ReturnType<typeof executionContext> };

describe("GitHub webhook security and dispatch", () => {
  it("accepts a valid raw-body signature and queues once", async () => {
    const store = new MemoryWebhookStore();
    const body = JSON.stringify(workflowRunPayload());
    const request = signedRequest(body, deliveryId);
    const first = await handleGitHubWebhookRequest(request, { secret, store, contextSource });
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ outcome: "queued", agentRunId: "run_1" });
    expect(store.created).toHaveLength(1);
    expect(store.created[0]).toMatchObject({ githubRunId: "7001", githubRunAttempt: 1, workflowName: "Terraform CI", status: "queued" });

    const retry = await handleGitHubWebhookRequest(signedRequest(body, deliveryId), { secret, store, contextSource });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ outcome: "duplicate" });
    expect(store.created).toHaveLength(1);
  });

  it("rejects missing, invalid, and wrong-body signatures before parsing", async () => {
    const store = new MemoryWebhookStore();
    const body = JSON.stringify(workflowRunPayload());
    const missing = new Request("http://localhost/api/github/webhooks", { method: "POST", body, headers: webhookHeaders(deliveryId) });
    expect((await handleGitHubWebhookRequest(missing, { secret, store, contextSource })).status).toBe(401);

    const invalid = new Request("http://localhost/api/github/webhooks", { method: "POST", body, headers: { ...webhookHeaders(deliveryId), "x-hub-signature-256": "sha256=" + "0".repeat(64) } });
    expect((await handleGitHubWebhookRequest(invalid, { secret, store, contextSource })).status).toBe(401);

    const signedForOtherBody = signedRequest(body, deliveryId, "different body");
    expect((await handleGitHubWebhookRequest(signedForOtherBody, { secret, store, contextSource })).status).toBe(401);
    expect(store.created).toHaveLength(0);
  });
});

describe("workflow_run filtering", () => {
  it.each([
    ["workflow_not_configured", repositorySnapshot(), workflowRunPayload({ name: "Unit tests" }), executionContext()],
    ["repository_not_ready", repositorySnapshot({ config: null }), workflowRunPayload(), executionContext()],
    ["repository_not_ready", repositorySnapshot({ awsConnected: false }), workflowRunPayload(), executionContext()],
    ["repository_not_ready", repositorySnapshot({ accessible: false }), workflowRunPayload(), executionContext()],
    ["trigger_disabled", repositorySnapshot({ config: { ...repositorySnapshot().config!, triggerOnPullRequest: false } }), workflowRunPayload(), executionContext()],
    ["fork_pr_untrusted", repositorySnapshot(), workflowRunPayload(), executionContext({ isForkPullRequest: true })],
    ["not_terraform_change", repositorySnapshot(), workflowRunPayload(), executionContext({ changedFiles: ["src/index.ts"] })],
  ])("records %s without queuing execution", async (reason, repository, payload, context) => {
    const store = new MemoryWebhookStore(repository as WebhookRepositorySnapshot);
    const result = await processWebhookDelivery(store, { resolve: async () => context as ReturnType<typeof executionContext> }, { deliveryId, eventName: "workflow_run", payload });
    expect(result).toMatchObject({ outcome: "skipped", reason });
    if (store.created[0]) expect(store.created[0]).toMatchObject({ status: "skipped", skipReason: reason });
  });

  it("ignores a successful Terraform workflow without creating a run", async () => {
    const store = new MemoryWebhookStore();
    const result = await processWebhookDelivery(store, contextSource, { deliveryId, eventName: "workflow_run", payload: workflowRunPayload({ conclusion: "success" }) });
    expect(result.outcome).toBe("ignored");
    expect(store.created).toHaveLength(0);
  });

  it("audits pull_request, push, and check_run without invoking the agent", async () => {
    for (const eventName of ["pull_request", "push", "check_run"]) {
      const store = new MemoryWebhookStore();
      const result = await processWebhookDelivery(store, contextSource, { deliveryId: `${eventName}-delivery`, eventName, payload: { action: "opened" } });
      expect(result).toEqual({ outcome: "ignored", reason: "unsupported_event" });
      expect(store.created).toHaveLength(0);
    }
  });
});

function signedRequest(body: string, id: string, signedBody = body) {
  return new Request("http://localhost/api/github/webhooks", {
    method: "POST",
    body,
    headers: { ...webhookHeaders(id), "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(signedBody).digest("hex")}` },
  });
}

function webhookHeaders(id: string) {
  return { "content-type": "application/json", "x-github-event": "workflow_run", "x-github-delivery": id };
}
