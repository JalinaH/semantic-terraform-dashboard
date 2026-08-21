import type { ClaimedAgentRun } from "@/lib/worker/types";

export interface AgentRunQueue {
  claim(workerId: string): Promise<ClaimedAgentRun | null>;
}

export function claimNextWorkerJob(queue: AgentRunQueue, workerId: string) {
  return queue.claim(workerId);
}

export function staleRunCutoff(timeoutMs: number, now = new Date(), graceMs = 60_000) {
  return new Date(now.getTime() - timeoutMs - graceMs);
}
