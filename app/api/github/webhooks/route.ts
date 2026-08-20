import { getGitHubWebhookSecret, MissingWebhookConfigurationError } from "@/lib/config";
import { prismaWebhookDeliveryStore } from "@/lib/data/webhook-deliveries";
import { createWorkflowContextSource } from "@/lib/github/actions";
import { handleGitHubWebhookRequest } from "@/lib/webhooks/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return await handleGitHubWebhookRequest(request, {
      secret: getGitHubWebhookSecret(),
      store: prismaWebhookDeliveryStore,
      contextSource: createWorkflowContextSource(),
    });
  } catch (error) {
    if (error instanceof MissingWebhookConfigurationError) {
      return Response.json({ error: "webhook_not_configured" }, { status: 503 });
    }
    console.error("GitHub webhook route failed", { operation: "receive" });
    return Response.json({ error: "webhook_unavailable" }, { status: 500 });
  }
}
