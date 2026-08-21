ALTER TABLE "AgentRun"
  ADD COLUMN "workerStage" TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN "heartbeatAt" TIMESTAMP(3);

UPDATE "AgentRun"
SET
  "workerStage" = lower("status"::TEXT),
  "heartbeatAt" = COALESCE("updatedAt", "claimedAt", "createdAt");

CREATE INDEX "AgentRun_status_heartbeatAt_idx" ON "AgentRun"("status", "heartbeatAt");
