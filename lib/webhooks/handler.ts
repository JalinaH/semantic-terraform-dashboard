import { verifyGitHubWebhookSignature } from "@/lib/github/webhook-signature";
import { webhookDeliveryIdSchema, webhookEventNameSchema } from "@/lib/github/webhook-types";
import type { WebhookDeliveryStore, WebhookWorkflowContextSource } from "@/lib/webhooks/service";
import { processWebhookDelivery } from "@/lib/webhooks/service";

const MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024;

export async function handleGitHubWebhookRequest(
  request: Request,
  dependencies: { secret: string; store: WebhookDeliveryStore; contextSource: WebhookWorkflowContextSource },
) {
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength > MAX_WEBHOOK_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413 });
  if (!verifyGitHubWebhookSignature(dependencies.secret, rawBody, request.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  const event = webhookEventNameSchema.safeParse(request.headers.get("x-github-event"));
  const delivery = webhookDeliveryIdSchema.safeParse(request.headers.get("x-github-delivery"));
  if (!event.success || !delivery.success) return Response.json({ error: "invalid_headers" }, { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await processWebhookDelivery(dependencies.store, dependencies.contextSource, {
      deliveryId: delivery.data,
      eventName: event.data,
      payload,
    });
    return Response.json(result, { status: result.outcome === "queued" ? 202 : 200 });
  } catch {
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }
}
