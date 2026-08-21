CREATE TYPE "PublicationStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'SKIPPED');

ALTER TABLE "GitHubInstallation" ADD COLUMN "pullRequestsPermission" TEXT;

CREATE TABLE "AgentRunPublication" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "pullRequestNumber" INTEGER,
    "provider" TEXT NOT NULL DEFAULT 'github',
    "externalCommentId" TEXT,
    "externalCommentNodeId" TEXT,
    "commentUrl" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "skipReason" TEXT,
    "redactionWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workerId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentRunPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRunPublication_agentRunId_key" ON "AgentRunPublication"("agentRunId");
CREATE INDEX "AgentRunPublication_status_nextAttemptAt_createdAt_idx" ON "AgentRunPublication"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "AgentRunPublication_repositoryId_pullRequestNumber_createdAt_idx" ON "AgentRunPublication"("repositoryId", "pullRequestNumber", "createdAt");

ALTER TABLE "AgentRunPublication" ADD CONSTRAINT "AgentRunPublication_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRunPublication" ADD CONSTRAINT "AgentRunPublication_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
