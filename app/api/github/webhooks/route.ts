import { getGitHubWebhookSecret, MissingWebhookConfigurationError } from "@/lib/config";
import { prismaWebhookDeliveryStore } from "@/lib/data/webhook-deliveries";
import { createWorkflowContextSource } from "@/lib/github/actions";
import { handleGitHubWebhookRequest } from "@/lib/webhooks/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const deliveryId = request.headers.get("x-github-delivery")?.slice(0, 64) ?? null;
  const eventName = request.headers.get("x-github-event")?.slice(0, 64) ?? null;
  try {
    const response = await handleGitHubWebhookRequest(request, {
      secret: getGitHubWebhookSecret(),
      store: prismaWebhookDeliveryStore,
      contextSource: createWorkflowContextSource(),
      onResult: (result) => console.info("GitHub webhook processed", {
        ...result,
        durationMs: Date.now() - startedAt,
      }),
    });
    if (response.status >= 400) {
      console.warn("GitHub webhook rejected", {
        deliveryId,
        eventName,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof MissingWebhookConfigurationError) {
      console.error("GitHub webhook unavailable", { deliveryId, eventName, reason: "configuration_missing", durationMs: Date.now() - startedAt });
      return Response.json({ error: "webhook_not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    console.error("GitHub webhook route failed", { deliveryId, eventName, operation: "receive", durationMs: Date.now() - startedAt });
    return Response.json({ error: "webhook_unavailable" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
