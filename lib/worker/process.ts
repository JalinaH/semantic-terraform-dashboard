import { parseAgentResult, sanitizeSuccessfulAgentResult } from "@/lib/agent-result";
import { WorkerExecutionError } from "@/lib/worker/errors";
import type { ClaimedAgentRun, WorkerDependencies } from "@/lib/worker/types";

export async function processClaimedAgentRun(run: ClaimedAgentRun, dependencies: WorkerDependencies) {
  let workspace: Awaited<ReturnType<WorkerDependencies["github"]["prepare"]>> | null = null;
  try {
    if (!run.repositoryAccessible || !run.installationActive || !run.aws?.connected) {
      throw new WorkerExecutionError("repository_access_removed");
    }
    workspace = await dependencies.github.prepare(run);
    await dependencies.store.updateFailedStage(run.id, workspace.failedStage);
    if (workspace.failedStage === "unknown") {
      await dependencies.store.markSkipped(run.id, "not_terraform_failure");
      return { outcome: "skipped" as const };
    }
    if (!run.config.failedStages.includes(workspace.failedStage)) {
      await dependencies.store.markSkipped(run.id, "trigger_disabled");
      return { outcome: "skipped" as const };
    }

    const credentials = await dependencies.aws.assume(run);
    const rawResult = await dependencies.agent.invoke({ run, workspace, awsCredentials: credentials });
    const parsed = parseAgentResult(rawResult);
    if (!parsed.success || parsed.data.status !== "ok") throw new WorkerExecutionError("agent_result_invalid");
    const safeResult = sanitizeSuccessfulAgentResult(parsed.data);
    await dependencies.store.markCompleted(run.id, safeResult);
    return { outcome: "completed" as const, verificationStatus: safeResult.verificationStatus };
  } catch (error) {
    const workerError = error instanceof WorkerExecutionError
      ? error
      : new WorkerExecutionError("worker_internal_error", { cause: error });
    await dependencies.store.markFailed(run.id, workerError.code, workerError.message);
    return { outcome: "failed" as const, errorCode: workerError.code };
  } finally {
    await workspace?.cleanup().catch(() => undefined);
  }
}
