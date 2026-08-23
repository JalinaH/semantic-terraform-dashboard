import { verifyGitHubWebhookSignature } from "@/lib/github/webhook-signature";
import { webhookDeliveryIdSchema, webhookEventNameSchema } from "@/lib/github/webhook-types";
import type { WebhookDeliveryStore, WebhookWorkflowContextSource } from "@/lib/webhooks/service";
import { processWebhookDelivery } from "@/lib/webhooks/service";

const MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024;

export async function handleGitHubWebhookRequest(
  request: Request,
  dependencies: {
    secret: string;
    store: WebhookDeliveryStore;
    contextSource: WebhookWorkflowContextSource;
    onResult?(event: {
      deliveryId: string;
      eventName: string;
      repositoryId: string | null;
      outcome: string;
      agentRunId: string | null;
      skipReason: string | null;
    }): void;
  },
) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return webhookJson({ error: "payload_too_large" }, 413);
  }
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength > MAX_WEBHOOK_BODY_BYTES) return webhookJson({ error: "payload_too_large" }, 413);
  if (!verifyGitHubWebhookSignature(dependencies.secret, rawBody, request.headers.get("x-hub-signature-256"))) {
    return webhookJson({ error: "invalid_signature" }, 401);
  }

  const event = webhookEventNameSchema.safeParse(request.headers.get("x-github-event"));
  const delivery = webhookDeliveryIdSchema.safeParse(request.headers.get("x-github-delivery"));
  if (!event.success || !delivery.success) return webhookJson({ error: "invalid_headers" }, 400);

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return webhookJson({ error: "invalid_json" }, 400);
  }

  try {
    const result = await processWebhookDelivery(dependencies.store, dependencies.contextSource, {
      deliveryId: delivery.data,
      eventName: event.data,
      payload,
    });
    dependencies.onResult?.({
      deliveryId: delivery.data,
      eventName: event.data,
      repositoryId: safeRepositoryId(payload),
      outcome: result.outcome,
      agentRunId: "agentRunId" in result ? result.agentRunId ?? null : null,
      skipReason: "reason" in result ? result.reason : null,
    });
    return webhookJson(result, result.outcome === "queued" ? 202 : 200);
  } catch {
    dependencies.onResult?.({
      deliveryId: delivery.data,
      eventName: event.data,
      repositoryId: safeRepositoryId(payload),
      outcome: "processing_failed",
      agentRunId: null,
      skipReason: null,
    });
    return webhookJson({ error: "processing_failed" }, 500);
  }
}

function webhookJson(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function safeRepositoryId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const repository = Reflect.get(payload, "repository");
  if (!repository || typeof repository !== "object") return null;
  const id = Reflect.get(repository, "id");
  return typeof id === "number" || typeof id === "string" ? String(id).slice(0, 32) : null;
}
