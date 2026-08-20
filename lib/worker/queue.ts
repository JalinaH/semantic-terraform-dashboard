import type { ClaimedAgentRun } from "@/lib/worker/types";

export interface AgentRunQueue {
  claim(workerId: string): Promise<ClaimedAgentRun | null>;
}

export function claimNextWorkerJob(queue: AgentRunQueue, workerId: string) {
  return queue.claim(workerId);
}
