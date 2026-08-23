import { describe, expect, it, vi } from "vitest";
import { parseAgentResult, sanitizeSuccessfulAgentResult } from "@/lib/agent-result";
import { WorkerExecutionError } from "@/lib/worker/errors";
import { processClaimedAgentRun } from "@/lib/worker/process";
import { claimNextWorkerJob, staleRunCutoff, type AgentRunQueue } from "@/lib/worker/queue";
import type { WorkerDependencies, WorkerRunStore } from "@/lib/worker/types";
import { claimedRun, validAgentResult } from "@/tests/phase5-fixtures";

describe("database-backed worker claiming contract", () => {
  it("claims a queued run once and does not reclaim it", async () => {
    let queued = claimedRun();
    const queue: AgentRunQueue = { async claim() { const claimed = queued; queued = null as never; return claimed; } };
    expect((await claimNextWorkerJob(queue, "worker-a"))?.id).toBe("run_1");
    expect(await claimNextWorkerJob(queue, "worker-b")).toBeNull();
  });
});

describe("hosted worker orchestration", () => {
  it("collects, assumes AWS, invokes the Python boundary, ingests safely, and cleans up", async () => {
    const cleanup = vi.fn(async () => undefined);
    const store = memoryRunStore();
    const dependencies: WorkerDependencies = {
      store,
      github: { prepare: vi.fn(async () => ({ checkoutPath: "/tmp/repo", failureLogPath: "/tmp/failure.log", diffPath: "/tmp/change.diff", failedStage: "plan" as const, cleanup })) },
      aws: { assume: vi.fn(async () => temporaryCredentials()) },
      agent: { invoke: vi.fn(async () => validAgentResult()) },
    };
    const outcome = await processClaimedAgentRun(claimedRun(), dependencies);
    expect(outcome).toEqual({ outcome: "completed", verificationStatus: "verified_first_attempt" });
    expect(store.markCompleted).toHaveBeenCalledOnce();
    expect(store.updateFailedStage).toHaveBeenCalledWith("run_1", "plan");
    expect(store.updateProgress).toHaveBeenCalledWith("run_1", "collecting_github_context");
    expect(store.updateProgress).toHaveBeenCalledWith("run_1", "running_agent");
    expect(dependencies.aws.assume).toHaveBeenCalledOnce();
    expect(dependencies.agent.invoke).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("skips a log without a known Terraform failure before assuming AWS", async () => {
    const store = memoryRunStore();
    const aws = vi.fn(async () => temporaryCredentials());
    const outcome = await processClaimedAgentRun(claimedRun(), {
      store,
      github: { prepare: async () => ({ checkoutPath: "/tmp/repo", failureLogPath: "/tmp/log", diffPath: "/tmp/diff", failedStage: "unknown", cleanup: async () => undefined }) },
      aws: { assume: aws },
      agent: { invoke: async () => validAgentResult() },
    });
    expect(outcome.outcome).toBe("skipped");
    expect(store.markSkipped).toHaveBeenCalledWith("run_1", "not_terraform_failure");
    expect(aws).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed result", async () => ({ status: "ok", unexpected: true }), "agent_result_invalid"],
    ["execution timeout", async () => { throw new WorkerExecutionError("execution_timeout"); }, "execution_timeout"],
  ])("classifies %s as a safe failed run", async (_label, invoke, code) => {
    const store = memoryRunStore();
    const outcome = await processClaimedAgentRun(claimedRun(), {
      store,
      github: { prepare: async () => ({ checkoutPath: "/tmp/repo", failureLogPath: "/tmp/log", diffPath: "/tmp/diff", failedStage: "plan", cleanup: async () => undefined }) },
      aws: { assume: async () => temporaryCredentials() },
      agent: { invoke },
    });
    expect(outcome).toMatchObject({ outcome: "failed", errorCode: code });
    expect(store.markFailed).toHaveBeenCalledWith("run_1", code, expect.any(String));
  });

  it("bounds a hung pre-agent operation with the complete job deadline", async () => {
    const store = memoryRunStore();
    const outcome = await processClaimedAgentRun(claimedRun(), {
      store,
      github: { prepare: async () => new Promise<never>(() => undefined) },
      aws: { assume: async () => temporaryCredentials() },
      agent: { invoke: async () => validAgentResult() },
    }, { timeoutMs: 20 });
    expect(outcome).toEqual({ outcome: "failed", errorCode: "execution_timeout" });
    expect(store.markFailed).toHaveBeenCalledWith("run_1", "execution_timeout", expect.any(String));
  });
});

describe("stale worker recovery window", () => {
  it("adds a grace period beyond the configured complete-job timeout", () => {
    const now = new Date("2026-08-21T12:00:00.000Z");
    expect(staleRunCutoff(600_000, now)).toEqual(new Date("2026-08-21T11:49:00.000Z"));
  });
});

describe("safe result ingestion", () => {
  it("accepts progressive context selected by agent v1.0.0 auto mode", () => {
    const result = validAgentResult();
    result.context.selected_mode = "progressive";
    expect(parseAgentResult(result).success).toBe(true);
  });

  it("does not persist raw command output, logs, or recognizable secrets", () => {
    const accessKey = `AKIA${"A".repeat(16)}`;
    const result = validAgentResult({
      failure: { summary: `failed ${accessKey}`, detail: "GEMINI_API_KEY=super-secret-model-key", stage: "plan", resource_address: "aws_s3_bucket.assets", original_log: "full private log" },
      warnings: ["Bearer github_pat_abcdefghijklmnopqrstuvwxyz123456"],
    });
    const parsed = parseAgentResult(result);
    expect(parsed.success && parsed.data.status === "ok").toBe(true);
    if (!parsed.success || parsed.data.status !== "ok") throw new Error("fixture is invalid");
    const safe = sanitizeSuccessfulAgentResult(parsed.data);
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain(accessKey);
    expect(serialized).not.toContain("super-secret-model-key");
    expect(serialized).not.toContain("github_pat_");
    expect(serialized).not.toContain("full private log");
    expect(serialized).not.toContain("must not persist");
    expect(serialized).toContain("[REDACTED]");
  });
});

function memoryRunStore(): WorkerRunStore & Record<keyof WorkerRunStore, ReturnType<typeof vi.fn>> {
  return {
    markFailed: vi.fn(async () => undefined),
    markSkipped: vi.fn(async () => undefined),
    updateProgress: vi.fn(async () => undefined),
    updateFailedStage: vi.fn(async () => undefined),
    markCompleted: vi.fn(async () => undefined),
  };
}

function temporaryCredentials() {
  return { accessKeyId: "temporary", secretAccessKey: "temporary", sessionToken: "temporary", region: "us-east-1" };
}
