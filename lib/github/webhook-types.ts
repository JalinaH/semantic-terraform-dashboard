import { z } from "zod";

export const webhookEventNameSchema = z.string().min(1).max(80).regex(/^[a-z_]+$/);
export const webhookDeliveryIdSchema = z.string().min(8).max(100).regex(/^[A-Za-z0-9-]+$/);

const shaSchema = z.string().regex(/^[a-f0-9]{40}$/i);

const repositorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  full_name: z.string().min(3),
  owner: z.object({ login: z.string().min(1) }),
});

const pullRequestReferenceSchema = z.object({
  number: z.number().int().positive(),
  head: z.object({ sha: shaSchema }).passthrough().optional(),
  base: z.object({ sha: shaSchema }).passthrough().optional(),
}).passthrough();

export const workflowRunWebhookSchema = z.object({
  action: z.string(),
  installation: z.object({ id: z.number().int().positive() }),
  repository: repositorySchema,
  workflow_run: z.object({
    id: z.number().int().positive(),
    run_attempt: z.number().int().positive().default(1),
    name: z.string().min(1),
    event: z.string().min(1),
    status: z.string().nullable().optional(),
    conclusion: z.string().nullable().optional(),
    head_sha: shaSchema,
    head_branch: z.string().nullable().optional(),
    pull_requests: z.array(pullRequestReferenceSchema).default([]),
  }).passthrough(),
}).passthrough();

export const genericWebhookSchema = z.object({
  action: z.string().optional(),
  installation: z.object({ id: z.number().int().positive() }).optional(),
  repository: repositorySchema.optional(),
}).passthrough();

export type WorkflowRunWebhook = z.infer<typeof workflowRunWebhookSchema>;

export interface WorkflowExecutionContext {
  pullRequestNumber: number | null;
  baseSha: string | null;
  headSha: string;
  commitSha: string;
  branch: string | null;
  changedFiles: string[];
  isForkPullRequest: boolean;
  comparisonFallback: string | null;
}
