import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInstallationAccessToken } from "@/lib/github/app";
import { collectTerraformFailureLog, createActionsLogSource } from "@/lib/github/actions";
import { WorkerExecutionError } from "@/lib/worker/errors";
import type { ClaimedAgentRun, PreparedAgentWorkspace } from "@/lib/worker/types";
import { runCommand } from "@/worker/command";

const SHA_PATTERN = /^[a-f0-9]{40}$/i;

export async function prepareGitHubWorkspace(run: ClaimedAgentRun): Promise<PreparedAgentWorkspace> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), `stfa-${run.id.slice(0, 12)}-`));
  const checkoutPath = path.join(workspaceRoot, "repository");
  const failureLogPath = path.join(workspaceRoot, "terraform-failure.log");
  const diffPath = path.join(workspaceRoot, "changes.diff");
  const cleanup = async () => { await rm(workspaceRoot, { recursive: true, force: true }); };

  try {
    if (!SHA_PATTERN.test(run.commitSha) || (run.baseSha && !SHA_PATTERN.test(run.baseSha))) {
      throw new WorkerExecutionError("github_checkout_failed");
    }
    const [token, logSource] = await Promise.all([
      createInstallationAccessToken(run.installationId),
      createActionsLogSource(run.installationId, run.repositoryOwner, run.repositoryName),
    ]);
    const collected = await collectTerraformFailureLog(logSource, Number(run.githubRunId));
    if (!collected) throw new WorkerExecutionError("github_log_unavailable");
    await checkoutExactRevision(run, checkoutPath, token);
    const diff = await createRepositoryDiff(run, checkoutPath);
    await Promise.all([
      writeFile(failureLogPath, collected.log, { encoding: "utf8", mode: 0o600 }),
      writeFile(diffPath, diff, { encoding: "utf8", mode: 0o600 }),
    ]);
    return { checkoutPath, failureLogPath, diffPath, failedStage: collected.failedStage, cleanup };
  } catch (error) {
    await cleanup();
    if (error instanceof WorkerExecutionError) throw error;
    throw new WorkerExecutionError("github_checkout_failed", { cause: error });
  }
}

async function checkoutExactRevision(run: ClaimedAgentRun, checkoutPath: string, token: string) {
  const authEnvironment = gitAuthEnvironment(token);
  await requireGit(["init", checkoutPath]);
  await requireGit(["-C", checkoutPath, "remote", "add", "origin", buildRepositoryCloneUrl(run.repositoryFullName)]);
  try {
    await requireGit(["-C", checkoutPath, "fetch", "--no-tags", "--depth=2", "origin", run.commitSha], authEnvironment);
    await requireGit(["-C", checkoutPath, "checkout", "--detach", run.commitSha]);
    if (run.baseSha && run.baseSha !== run.commitSha) {
      await requireGit(["-C", checkoutPath, "fetch", "--no-tags", "--depth=1", "origin", run.baseSha], authEnvironment);
    }
  } finally {
    await runCommand("git", ["-C", checkoutPath, "remote", "remove", "origin"]);
  }
}

export async function createRepositoryDiff(run: ClaimedAgentRun, checkoutPath: string) {
  let baseSha = run.baseSha;
  if (!baseSha) {
    const parent = await runCommand("git", ["-C", checkoutPath, "rev-parse", `${run.commitSha}^`]);
    baseSha = parent.exitCode === 0 && SHA_PATTERN.test(parent.stdout.trim()) ? parent.stdout.trim() : null;
  }
  if (!baseSha) return "";
  const result = await runCommand("git", ["-C", checkoutPath, "diff", "--no-ext-diff", baseSha, run.commitSha, "--"]);
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

async function requireGit(args: string[], env?: NodeJS.ProcessEnv) {
  const result = await runCommand("git", args, {
    env: env ?? { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, HOME: process.env.HOME },
    timeoutMs: 120_000,
  });
  if (result.exitCode !== 0 || result.timedOut) throw new WorkerExecutionError("github_checkout_failed");
}
