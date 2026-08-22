-- Phase 8 scans authorized runs by UTC period across repositories. Boolean telemetry
-- remains intentionally unindexed because its selectivity is low at MVP scale.
CREATE INDEX "AgentRun_createdAt_idx" ON "AgentRun"("createdAt");
