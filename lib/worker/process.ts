import { parseAgentResult, sanitizeSuccessfulAgentResult } from "@/lib/agent-result";
import { createWorkerDeadline, withPersistenceTimeout } from "@/lib/worker/deadline";
import { WorkerExecutionError } from "@/lib/worker/errors";
import { getWorkerConfiguration } from "@/lib/config";
import type { ClaimedAgentRun, WorkerDependencies, WorkerStage } from "@/lib/worker/types";

const DEFAULT_JOB_TIMEOUT_MS = 10 * 60 * 1_000;

export async function processClaimedAgentRun(
  run: ClaimedAgentRun,
  dependencies: WorkerDependencies,
  options: { timeoutMs?: number; onProgress?(stage: WorkerStage): void } = {},
) {
  const deadline = createWorkerDeadline(options.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS);
  let workspace: Awaited<ReturnType<WorkerDependencies["github"]["prepare"]>> | null = null;
  const progress = async (stage: WorkerStage) => {
    await deadline.run(() => dependencies.store.updateProgress(run.id, stage));
    options.onProgress?.(stage);
  };
  try {
    if (!run.repositoryAccessible || !run.installationActive || !run.aws?.connected) {
      throw new WorkerExecutionError("repository_access_removed");
    }
    await progress("collecting_github_context");
    workspace = await deadline.run(() => dependencies.github.prepare(run, {
      signal: deadline.signal,
      onProgress: progress,
    }));
    await deadline.run(() => dependencies.store.updateFailedStage(run.id, workspace!.failedStage));
    if (workspace.failedStage === "unknown") {
      await deadline.run(() => dependencies.store.markSkipped(run.id, "not_terraform_failure"));
      return { outcome: "skipped" as const };
    }
    if (!run.config.failedStages.includes(workspace.failedStage)) {
      await deadline.run(() => dependencies.store.markSkipped(run.id, "trigger_disabled"));
      return { outcome: "skipped" as const };
    }

    await progress("assuming_aws_role");
    const credentials = await deadline.run(() => dependencies.aws.assume(run, deadline.signal));
    await progress("running_agent");
    const rawResult = await deadline.run(() => dependencies.agent.invoke({
      run,
      workspace: workspace!,
      awsCredentials: credentials,
      signal: deadline.signal,
    }));
    await progress("ingesting_result");
    const parsed = parseAgentResult(rawResult);
    if (!parsed.success || parsed.data.status !== "ok") throw new WorkerExecutionError("agent_result_invalid");
    const safeResult = sanitizeSuccessfulAgentResult(parsed.data, getWorkerConfiguration().agentVersion);
    await deadline.run(() => dependencies.store.markCompleted(run.id, safeResult));
    return { outcome: "completed" as const, verificationStatus: safeResult.verificationStatus };
  } catch (error) {
    const workerError = error instanceof WorkerExecutionError
      ? error
      : new WorkerExecutionError("worker_internal_error", { cause: error });
    await withPersistenceTimeout(dependencies.store.markFailed(run.id, workerError.code, workerError.message)).catch(() => undefined);
    return { outcome: "failed" as const, errorCode: workerError.code };
  } finally {
    deadline.dispose();
    await withPersistenceTimeout(workspace?.cleanup() ?? Promise.resolve()).catch(() => undefined);
  }
}
