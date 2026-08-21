import "server-only";

import { queueManualAgentRunPublication } from "@/lib/data/publications";

export interface ManualPublicationStore {
  queueForAuthorizedUser(userId: string, agentRunId: string): Promise<boolean>;
}

export async function requestManualPublication(
  userId: string,
  agentRunId: string,
  store: ManualPublicationStore = { queueForAuthorizedUser: queueManualAgentRunPublication },
) {
  return store.queueForAuthorizedUser(userId, agentRunId);
}
