import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleGitHubWebhookRequest } from "@/lib/webhooks/handler";
import type { CreateWebhookRunInput, WebhookDeliveryStore } from "@/lib/webhooks/service";
import { processClaimedAgentRun } from "@/lib/worker/process";
import { claimNextWorkerJob } from "@/lib/worker/queue";
import { claimedRun, executionContext, repositorySnapshot, validAgentResult, workflowRunPayload } from "@/tests/phase5-fixtures";

describe("signed webhook to completed hosted run", () => {
  it("queues, claims, executes mocked boundaries, and completes", async () => {
    const secret = "integration-secret";
    const deliveryId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const body = JSON.stringify(workflowRunPayload());
    let queued = false;
    const webhookStore: WebhookDeliveryStore = {
      reserve: async () => "reserved",
      findRepository: async () => repositorySnapshot() as ReturnType<typeof repositorySnapshot>,
      createRun: async (input: CreateWebhookRunInput) => { queued = input.status === "queued"; return { id: "run_1" }; },
      complete: async () => undefined,
      fail: async () => undefined,
    };
    const response = await handleGitHubWebhookRequest(new Request("http://localhost/api/github/webhooks", {
      method: "POST",
      body,
      headers: {
        "x-github-event": "workflow_run",
        "x-github-delivery": deliveryId,
        "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
      },
    }), { secret, store: webhookStore, contextSource: { resolve: async () => executionContext() as ReturnType<typeof executionContext> } });
    expect(response.status).toBe(202);
    expect(queued).toBe(true);

    const run = await claimNextWorkerJob({ claim: async () => { if (!queued) return null; queued = false; return claimedRun(); } }, "integration-worker");
    expect(run).not.toBeNull();
    const markCompleted = vi.fn(async () => undefined);
    const outcome = await processClaimedAgentRun(run!, {
      store: {
        markFailed: vi.fn(async () => undefined),
        markSkipped: vi.fn(async () => undefined),
        updateProgress: vi.fn(async () => undefined),
        updateFailedStage: vi.fn(async () => undefined),
        markCompleted,
      },
      github: { prepare: async () => ({ checkoutPath: "/tmp/repo", failureLogPath: "/tmp/log", diffPath: "/tmp/diff", failedStage: "plan", cleanup: async () => undefined }) },
      aws: { assume: async () => ({ accessKeyId: "tmp", secretAccessKey: "tmp", sessionToken: "tmp", region: "us-east-1" }) },
      agent: { invoke: async () => validAgentResult() },
    });
    expect(outcome.outcome).toBe("completed");
    expect(markCompleted).toHaveBeenCalledOnce();
    expect(queued).toBe(false);
  });
});
