import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInstallationAccessToken } from "@/lib/github/app";
import { collectTerraformFailureLog, createActionsLogSource } from "@/lib/github/actions";
import { WorkerExecutionError } from "@/lib/worker/errors";
import type { ClaimedAgentRun, PreparedAgentWorkspace, WorkerStage } from "@/lib/worker/types";
import { runCommand } from "@/worker/command";

const SHA_PATTERN = /^[a-f0-9]{40}$/i;

export async function prepareGitHubWorkspace(
  run: ClaimedAgentRun,
  options: { signal?: AbortSignal; onProgress?(stage: WorkerStage): Promise<void> } = {},
): Promise<PreparedAgentWorkspace> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), `stfa-${run.id.slice(0, 12)}-`));
  const checkoutPath = path.join(workspaceRoot, "repository");
  const failureLogPath = path.join(workspaceRoot, "terraform-failure.log");
  const diffPath = path.join(workspaceRoot, "changes.diff");
  const cleanup = async () => { await rm(workspaceRoot, { recursive: true, force: true }); };

  try {
    throwIfAborted(options.signal);
    if (!SHA_PATTERN.test(run.commitSha) || (run.baseSha && !SHA_PATTERN.test(run.baseSha))) {
      throw new WorkerExecutionError("github_checkout_failed");
    }
    const [token, logSource] = await Promise.all([
      createInstallationAccessToken(run.installationId),
      createActionsLogSource(run.installationId, run.repositoryOwner, run.repositoryName),
    ]);
    const collected = await collectTerraformFailureLog(logSource, Number(run.githubRunId))
      .catch((error: unknown) => {
        throw new WorkerExecutionError("github_log_unavailable", { cause: error });
      });
    if (!collected) throw new WorkerExecutionError("github_log_unavailable");
    throwIfAborted(options.signal);
    await options.onProgress?.("checking_out_repository");
    await checkoutExactRevision(run, checkoutPath, token, options.signal);
    const diff = await createRepositoryDiff(run, checkoutPath, options.signal);
    await Promise.all([
      writeFile(failureLogPath, collected.log, { encoding: "utf8", mode: 0o600 }),
      writeFile(diffPath, diff, { encoding: "utf8", mode: 0o600 }),
    ]);
    return { checkoutPath, failureLogPath, diffPath, failedStage: collected.failedStage, cleanup };
  } catch (error) {
    await cleanup();
    if (options.signal?.aborted) throw new WorkerExecutionError("execution_timeout", { cause: error });
    if (error instanceof WorkerExecutionError) throw error;
    throw new WorkerExecutionError("github_checkout_failed", { cause: error });
  }
}

async function checkoutExactRevision(run: ClaimedAgentRun, checkoutPath: string, token: string, signal?: AbortSignal) {
  const authEnvironment = gitAuthEnvironment(token);
  await requireGit(["init", checkoutPath], undefined, signal);
  await requireGit(["-C", checkoutPath, "remote", "add", "origin", buildRepositoryCloneUrl(run.repositoryFullName)], undefined, signal);
  try {
    await requireGit(["-C", checkoutPath, "fetch", "--no-tags", "--depth=2", "origin", run.commitSha], authEnvironment, signal);
    await requireGit(["-C", checkoutPath, "checkout", "--detach", run.commitSha], undefined, signal);
    if (run.baseSha && run.baseSha !== run.commitSha) {
      await requireGit(["-C", checkoutPath, "fetch", "--no-tags", "--depth=1", "origin", run.baseSha], authEnvironment, signal);
    }
  } finally {
    await runCommand("git", ["-C", checkoutPath, "remote", "remove", "origin"], { signal });
  }
}

export async function createRepositoryDiff(run: ClaimedAgentRun, checkoutPath: string, signal?: AbortSignal) {
  let baseSha = run.baseSha;
  if (!baseSha) {
    const parent = await runCommand("git", ["-C", checkoutPath, "rev-parse", `${run.commitSha}^`], { signal });
    baseSha = parent.exitCode === 0 && SHA_PATTERN.test(parent.stdout.trim()) ? parent.stdout.trim() : null;
  }
  if (!baseSha) return "";
  const result = await runCommand("git", ["-C", checkoutPath, "diff", "--no-ext-diff", baseSha, run.commitSha, "--"], { signal });
  if (result.exitCode !== 0) throw new WorkerExecutionError("github_checkout_failed");
  return result.stdout;
}

export function buildRepositoryCloneUrl(repositoryFullName: string) {
  return `https://github.com/${repositoryFullName}.git`;
}

function gitAuthEnvironment(token: string): NodeJS.ProcessEnv {
  const basic = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
  return {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  };
}

async function requireGit(args: string[], env?: NodeJS.ProcessEnv, signal?: AbortSignal) {
  const result = await runCommand("git", args, {
    env: env ?? { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, HOME: process.env.HOME },
    timeoutMs: 120_000,
    signal,
  });
  if (result.exitCode !== 0 || result.timedOut) throw new WorkerExecutionError("github_checkout_failed");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new WorkerExecutionError("execution_timeout");
}
