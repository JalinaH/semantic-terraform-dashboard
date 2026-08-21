import { Octokit } from "@octokit/rest";
import { createInstallationAccessToken } from "@/lib/github/app";
import type { WorkflowExecutionContext, WorkflowRunWebhook } from "@/lib/github/webhook-types";

const API_VERSION = "2022-11-28";
const USER_AGENT = "semantic-terraform-dashboard/0.5";
const GITHUB_REQUEST_TIMEOUT_MS = 15_000;
const MAX_JOB_LOG_BYTES = 2 * 1024 * 1024;
const MAX_FAILURE_LOG_CHARS = 40_000;
const TERRAFORM_SIGNAL = /(?:\bterraform\b|\btofu\b|error:|╷|invalid (?:argument|value|resource)|unsupported argument|failed to (?:plan|validate|initialize))/i;
const TERRAFORM_JOB = /(?:terraform|tofu|infrastructure|\bplan\b|\bvalidate\b)/i;

export interface WorkflowContextSource {
  resolve(payload: WorkflowRunWebhook): Promise<WorkflowExecutionContext>;
}

export function createWorkflowContextSource(): WorkflowContextSource {
  return {
    async resolve(payload) {
      const token = await createInstallationAccessToken(String(payload.installation.id));
      const octokit = new Octokit({ auth: token, userAgent: USER_AGENT, request: { timeout: GITHUB_REQUEST_TIMEOUT_MS } });
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const run = payload.workflow_run;
      const pullReference = run.pull_requests[0];

      if (pullReference) {
        const pull = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: pullReference.number,
          headers: { "X-GitHub-Api-Version": API_VERSION },
        });
        const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
          owner,
          repo,
          pull_number: pullReference.number,
          per_page: 100,
          headers: { "X-GitHub-Api-Version": API_VERSION },
        });
        return {
          pullRequestNumber: pullReference.number,
          baseSha: pull.data.base.sha,
          headSha: pull.data.head.sha,
          commitSha: pull.data.head.sha,
          branch: pull.data.head.ref,
          changedFiles: files.map((file) => file.filename),
          isForkPullRequest: Boolean(pull.data.head.repo?.fork) || pull.data.head.repo?.full_name !== payload.repository.full_name,
          comparisonFallback: null,
        };
      }

      if (run.event === "pull_request" || run.event === "pull_request_target") {
        return {
          pullRequestNumber: null,
          baseSha: null,
          headSha: run.head_sha,
          commitSha: run.head_sha,
          branch: run.head_branch ?? null,
          changedFiles: [],
          isForkPullRequest: true,
          comparisonFallback: "missing_pull_request_metadata",
        };
      }

      const commit = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: run.head_sha,
        per_page: 100,
        headers: { "X-GitHub-Api-Version": API_VERSION },
      });
      return {
        pullRequestNumber: null,
        baseSha: commit.data.parents[0]?.sha ?? null,
        headSha: run.head_sha,
        commitSha: run.head_sha,
        branch: run.head_branch ?? null,
        changedFiles: (commit.data.files ?? []).map((file) => file.filename),
        isForkPullRequest: false,
        comparisonFallback: commit.data.parents[0]?.sha ? null : "local_parent_commit",
      };
    },
  };
}

export interface WorkflowJobSummary {
  id: number;
  name: string;
  conclusion: string | null;
  steps: Array<{ name: string; conclusion: string | null }>;
}

export interface ActionsLogSource {
  listJobs(runId: number): Promise<WorkflowJobSummary[]>;
  downloadJobLog(jobId: number): Promise<string>;
}

export interface CollectedTerraformFailure {
  log: string;
  failedStage: "validate" | "plan" | "unknown";
  jobIds: number[];
}

export async function collectTerraformFailureLog(
  source: ActionsLogSource,
  runId: number,
): Promise<CollectedTerraformFailure | null> {
  const jobs = await source.listJobs(runId);
  const failed = jobs.filter((job) => job.conclusion === "failure");
  const preferred = failed.filter((job) => TERRAFORM_JOB.test(job.name) || job.steps.some((step) => step.conclusion === "failure" && TERRAFORM_JOB.test(step.name)));
  const candidates = (preferred.length ? preferred : failed).slice(0, 3);
  const excerpts: string[] = [];
  const jobIds: number[] = [];
  let failedStage: CollectedTerraformFailure["failedStage"] = "unknown";

  for (const job of candidates) {
    const raw = await source.downloadJobLog(job.id);
    const excerpt = extractTerraformFailureText(raw);
    if (!excerpt) continue;
    jobIds.push(job.id);
    excerpts.push(`## GitHub Actions job: ${job.name}\n${excerpt}`);
    const inferred = inferFailedStage(`${job.name}\n${job.steps.filter((step) => step.conclusion === "failure").map((step) => step.name).join("\n")}\n${excerpt}`);
    if (inferred === "validate" || failedStage === "unknown") failedStage = inferred;
  }

  if (!excerpts.length) return null;
  return {
    log: excerpts.join("\n\n").slice(0, MAX_FAILURE_LOG_CHARS),
    failedStage,
    jobIds,
  };
}

export function extractTerraformFailureText(rawLog: string) {
  const normalized = rawLog.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const matches = lines.flatMap((line, index) => TERRAFORM_SIGNAL.test(line) ? [index] : []);
  if (!matches.length) return null;
  const selected = new Set<number>();
  for (const index of matches) {
    for (let cursor = Math.max(0, index - 16); cursor <= Math.min(lines.length - 1, index + 28); cursor += 1) selected.add(cursor);
  }
  return [...selected].sort((left, right) => left - right).map((index) => lines[index]).join("\n").slice(0, MAX_FAILURE_LOG_CHARS);
}

export function inferFailedStage(text: string): CollectedTerraformFailure["failedStage"] {
  if (/(?:terraform\s+validate|\bvalidate\b.*(?:fail|error)|validation failed)/i.test(text)) return "validate";
  if (/(?:terraform\s+plan|\bplan\b.*(?:fail|error)|planning failed)/i.test(text)) return "plan";
  return "unknown";
}

export async function createActionsLogSource(installationId: string, owner: string, repo: string): Promise<ActionsLogSource> {
  const token = await createInstallationAccessToken(installationId);
  const octokit = new Octokit({ auth: token, userAgent: USER_AGENT, request: { timeout: GITHUB_REQUEST_TIMEOUT_MS } });
  return {
    async listJobs(runId) {
      const jobs = await octokit.paginate(octokit.rest.actions.listJobsForWorkflowRun, {
        owner,
        repo,
        run_id: runId,
        filter: "latest",
        per_page: 100,
        headers: { "X-GitHub-Api-Version": API_VERSION },
      });
      return jobs.map((job) => ({
        id: job.id,
        name: job.name,
        conclusion: job.conclusion,
        steps: (job.steps ?? []).map((step) => ({ name: step.name, conclusion: step.conclusion })),
      }));
    },
    async downloadJobLog(jobId) {
      const response = await fetchWithTimeout(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/jobs/${jobId}/logs`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": API_VERSION,
          },
          redirect: "follow",
        },
      );
      if (!response.ok) throw new Error(`GitHub job log request failed with status ${response.status}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_JOB_LOG_BYTES) throw new Error("GitHub job log exceeded the bounded download limit.");
      return new TextDecoder().decode(bytes);
    },
  };
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
