import { matchesConfiguredWorkflow, matchesTerraformPath } from "@/lib/github/patterns";
import {
  genericWebhookSchema,
  workflowRunWebhookSchema,
  type WorkflowExecutionContext,
} from "@/lib/github/webhook-types";
import type { RepositoryConfigInput } from "@/lib/repository-config/types";
import type { AgentModelRegistryEntry } from "@/lib/model-policy/types";

export type WebhookSkipReason =
  | "not_terraform_change"
  | "workflow_not_configured"
  | "repository_not_ready"
  | "trigger_disabled"
  | "fork_pr_untrusted"
  | "unsupported_event";

export interface WebhookRepositorySnapshot {
  id: string;
  installationDatabaseId: string;
  installationId: string;
  installationActive: boolean;
  accessible: boolean;
  config: RepositoryConfigInput | null;
  awsConnected: boolean;
  modelPolicyValid: boolean;
  accessLevel: "FREE" | "PRO" | "ADVANCED";
  modelRegistry: AgentModelRegistryEntry[];
  catalogSyncedAt: string | null;
}

export interface CreateWebhookRunInput {
  deliveryId: string;
  repository: WebhookRepositorySnapshot;
  eventName: string;
  githubRunId: string;
  githubRunAttempt: number;
  workflowName: string;
  context: WorkflowExecutionContext;
  status: "queued" | "skipped";
  skipReason?: WebhookSkipReason;
  workflowEvent: string;
}

export interface WebhookDeliveryStore {
  reserve(input: { deliveryId: string; eventName: string; action: string | null }): Promise<"reserved" | "duplicate">;
  findRepository(githubRepositoryId: string, installationId: string): Promise<WebhookRepositorySnapshot | null>;
  createRun(input: CreateWebhookRunInput): Promise<{ id: string }>;
  complete(deliveryId: string, input: { outcome: string; skipReason?: WebhookSkipReason; repositoryId?: string }): Promise<void>;
  fail(deliveryId: string): Promise<void>;
}

export interface WebhookWorkflowContextSource {
  resolve(payload: ReturnType<typeof workflowRunWebhookSchema.parse>): Promise<WorkflowExecutionContext>;
}

export type WebhookProcessingResult =
  | { outcome: "duplicate" }
  | { outcome: "ignored"; reason: WebhookSkipReason }
  | { outcome: "queued"; agentRunId: string }
  | { outcome: "skipped"; reason: WebhookSkipReason; agentRunId?: string };

export async function processWebhookDelivery(
  store: WebhookDeliveryStore,
  contextSource: WebhookWorkflowContextSource,
  input: { deliveryId: string; eventName: string; payload: unknown },
): Promise<WebhookProcessingResult> {
  const generic = genericWebhookSchema.safeParse(input.payload);
  const action = generic.success ? generic.data.action ?? null : null;
  if (await store.reserve({ deliveryId: input.deliveryId, eventName: input.eventName, action }) === "duplicate") {
    return { outcome: "duplicate" };
  }

  try {
    if (input.eventName !== "workflow_run") {
      await store.complete(input.deliveryId, { outcome: input.eventName === "ping" ? "ping" : "ignored", skipReason: input.eventName === "ping" ? undefined : "unsupported_event" });
      return input.eventName === "ping"
        ? { outcome: "ignored", reason: "unsupported_event" }
        : { outcome: "ignored", reason: "unsupported_event" };
    }

    const parsed = workflowRunWebhookSchema.safeParse(input.payload);
    if (!parsed.success) throw new Error("Invalid workflow_run webhook payload.");
    const payload = parsed.data;
    const run = payload.workflow_run;
    const repository = await store.findRepository(String(payload.repository.id), String(payload.installation.id));
    if (!repository) {
      await store.complete(input.deliveryId, { outcome: "skipped", skipReason: "repository_not_ready" });
      return { outcome: "skipped", reason: "repository_not_ready" };
    }

    if (payload.action !== "completed" || run.conclusion !== "failure") {
      await store.complete(input.deliveryId, { outcome: "ignored", repositoryId: repository.id, skipReason: "unsupported_event" });
      return { outcome: "ignored", reason: "unsupported_event" };
    }

    const readinessReason = repositoryReadinessSkipReason(repository, run.event);
    if (readinessReason) {
      if (!repository.config) {
        await store.complete(input.deliveryId, { outcome: "skipped", repositoryId: repository.id, skipReason: readinessReason });
        return { outcome: "skipped", reason: readinessReason };
      }
      return createSkipped(store, input.deliveryId, repository, payload, emptyContext(run.head_sha, run.head_branch ?? null), readinessReason);
    }

    const config = repository.config!;
    if (!matchesConfiguredWorkflow(run.name, config.workflowNames, config.workflowNamePatterns)) {
      return createSkipped(store, input.deliveryId, repository, payload, emptyContext(run.head_sha, run.head_branch ?? null), "workflow_not_configured");
    }

    const context = await contextSource.resolve(payload);
    if (context.isForkPullRequest) return createSkipped(store, input.deliveryId, repository, payload, context, "fork_pr_untrusted");
    if (!context.changedFiles.some((path) => matchesTerraformPath(path, config.terraformPathPatterns))) {
      return createSkipped(store, input.deliveryId, repository, payload, context, "not_terraform_change");
    }

    const created = await store.createRun(runInput(input.deliveryId, repository, payload, context, "queued"));
    return { outcome: "queued", agentRunId: created.id };
  } catch (error) {
    await store.fail(input.deliveryId);
    throw error;
  }
}

function repositoryReadinessSkipReason(repository: WebhookRepositorySnapshot, workflowEvent: string): WebhookSkipReason | null {
  if (!repository.accessible || !repository.installationActive || !repository.config || !repository.config.enabled || !repository.awsConnected || !repository.modelPolicyValid) {
    return "repository_not_ready";
  }
  if (workflowEvent === "pull_request") return repository.config.triggerOnPullRequest ? null : "trigger_disabled";
  if (workflowEvent === "push") return repository.config.triggerOnPush ? null : "trigger_disabled";
  return "trigger_disabled";
}

async function createSkipped(
  store: WebhookDeliveryStore,
  deliveryId: string,
  repository: WebhookRepositorySnapshot,
  payload: ReturnType<typeof workflowRunWebhookSchema.parse>,
  context: WorkflowExecutionContext,
  reason: WebhookSkipReason,
): Promise<WebhookProcessingResult> {
  const created = await store.createRun({ ...runInput(deliveryId, repository, payload, context, "skipped"), skipReason: reason });
  return { outcome: "skipped", reason, agentRunId: created.id };
}

function runInput(
  deliveryId: string,
  repository: WebhookRepositorySnapshot,
  payload: ReturnType<typeof workflowRunWebhookSchema.parse>,
  context: WorkflowExecutionContext,
  status: "queued" | "skipped",
): CreateWebhookRunInput {
  return {
    deliveryId,
    repository,
    eventName: "workflow_run",
    githubRunId: String(payload.workflow_run.id),
    githubRunAttempt: payload.workflow_run.run_attempt,
    workflowName: payload.workflow_run.name,
    context,
    status,
    workflowEvent: payload.workflow_run.event,
  };
}

function emptyContext(headSha: string, branch: string | null): WorkflowExecutionContext {
  return {
    pullRequestNumber: null,
    baseSha: null,
    headSha,
    commitSha: headSha,
    branch,
    changedFiles: [],
    isForkPullRequest: false,
    comparisonFallback: "context_not_collected",
  };
}
