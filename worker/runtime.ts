import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { getWorkerConfiguration } from "@/lib/config";
import { claimNextAgentRun, prismaWorkerRunStore, recoverStaleAgentRuns } from "@/lib/data/agent-runs";
import { claimNextPublication } from "@/lib/data/publications";
import { publishClaimedAgentRun } from "@/lib/publication/publish-agent-run";
import { processClaimedAgentRun } from "@/lib/worker/process";
import { claimNextWorkerJob, staleRunCutoff } from "@/lib/worker/queue";
import { invokeSemanticTerraformAgent } from "@/worker/agent";
import { assumeWorkerRepositoryRole } from "@/worker/aws";
import { prepareGitHubWorkspace } from "@/worker/github";
import { safeStartupDiagnostic } from "@/worker/diagnostics";

export async function runWorker(options: { once?: boolean } = {}) {
  const configuration = getWorkerConfiguration();
  const workerId = `${hostname().slice(0, 32)}-${randomUUID().slice(0, 8)}`;
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  safeLog({ event: "worker_started", workerId, pollIntervalMs: configuration.pollIntervalMs });
  let nextRecoveryAt = 0;

  do {
    let run;
    try {
      if (Date.now() >= nextRecoveryAt) {
        const recovered = await recoverStaleAgentRuns(staleRunCutoff(configuration.jobTimeoutSeconds * 1_000));
        if (recovered > 0) safeLog({ event: "stale_runs_recovered", workerId, count: recovered });
        nextRecoveryAt = Date.now() + 60_000;
      }
      run = await claimNextWorkerJob({ claim: claimNextAgentRun }, workerId);
    } catch (error) {
      if (options.once) throw error;
      const diagnostic = safeStartupDiagnostic(error);
      safeLog({
        event: "worker_database_unavailable",
        workerId,
        errorCode: diagnostic.errorCode,
        retryInMs: configuration.pollIntervalMs,
      });
      await delay(configuration.pollIntervalMs);
      continue;
    }
    if (!run) {
      let publicationId: string | null;
      try {
        publicationId = await claimNextPublication(workerId);
      } catch (error) {
        if (options.once) throw error;
        const diagnostic = safeStartupDiagnostic(error);
        safeLog({
          event: "worker_database_unavailable",
          workerId,
          errorCode: diagnostic.errorCode,
          retryInMs: configuration.pollIntervalMs,
        });
        await delay(configuration.pollIntervalMs);
        continue;
      }
      if (publicationId) {
        const startedAt = Date.now();
        safeLog({ event: "publication_claimed", workerId, publicationId });
        const result = await publishClaimedAgentRun(publicationId);
        safeLog({ event: "publication_finished", workerId, publicationId, outcome: result.outcome, durationMs: Date.now() - startedAt });
      } else {
        if (options.once) break;
        await delay(configuration.pollIntervalMs);
      }
      continue;
    }
    const startedAt = Date.now();
    safeLog({ event: "run_claimed", workerId, agentRunId: run.id, repositoryId: run.repositoryId });
    const result = await processClaimedAgentRun(run, {
      store: prismaWorkerRunStore,
      github: { prepare: prepareGitHubWorkspace },
      aws: { assume: assumeWorkerRepositoryRole },
      agent: { invoke: invokeSemanticTerraformAgent },
    }, {
      timeoutMs: configuration.jobTimeoutSeconds * 1_000,
      onProgress: (stage) => safeLog({ event: "run_progress", workerId, agentRunId: run.id, stage }),
    });
    safeLog({ event: "run_finished", workerId, agentRunId: run.id, repositoryId: run.repositoryId, outcome: result.outcome, durationMs: Date.now() - startedAt });
  } while (!stopping && !options.once);

  safeLog({ event: "worker_stopped", workerId });
}

export function workerHealthcheck() {
  const configuration = getWorkerConfiguration();
  return {
    status: "ok",
    agentVersion: configuration.agentVersion,
    timeoutSeconds: configuration.jobTimeoutSeconds,
  };
}

function safeLog(value: Record<string, string | number>) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
