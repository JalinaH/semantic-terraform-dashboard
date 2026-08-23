-- Phase 11 is additive: historical AgentRun rows remain unchanged and ineligible
-- until a v1.1 verified-patch provenance result is ingested.
CREATE TYPE "PatchApplicationStatus" AS ENUM ('PENDING', 'APPLYING', 'APPLIED', 'STALE', 'REJECTED', 'FAILED');

ALTER TABLE "GitHubInstallation" ADD COLUMN "contentsPermission" TEXT;

ALTER TABLE "AgentRun"
  ADD COLUMN "verifiedPatch" TEXT,
  ADD COLUMN "patchSha256" TEXT,
  ADD COLUMN "verifiedAgainstCommitSha" TEXT,
  ADD COLUMN "patchAffectedFiles" JSONB,
  ADD COLUMN "patchTerraformFilesOnly" BOOLEAN,
  ADD COLUMN "patchExistingFilesOnly" BOOLEAN,
  ADD COLUMN "patchRepositoryRelative" BOOLEAN,
  ADD COLUMN "patchSourceFingerprint" TEXT,
  ADD COLUMN "patchCandidateSource" TEXT,
  ADD COLUMN "mutationEligible" BOOLEAN,
  ADD COLUMN "mutationEligibilityReason" TEXT,
  ADD COLUMN "mutationEligibilityDetails" JSONB;

CREATE TABLE "PatchApplication" (
  "id" TEXT NOT NULL,
  "agentRunId" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "requestedByDisplay" TEXT,
  "status" "PatchApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "stage" TEXT NOT NULL DEFAULT 'queued',
  "patchSha256" TEXT NOT NULL,
  "expectedHeadSha" TEXT NOT NULL,
  "verifiedAgainstCommitSha" TEXT NOT NULL,
  "affectedFiles" JSONB NOT NULL,
  "terraformDir" TEXT NOT NULL,
  "terraformVersion" TEXT NOT NULL,
  "pullRequestNumber" INTEGER NOT NULL,
  "headBranch" TEXT NOT NULL,
  "headRepositoryFullName" TEXT NOT NULL,
  "intendedCommitSha" TEXT,
  "commitSha" TEXT,
  "commitUrl" TEXT,
  "pullRequestUrl" TEXT,
  "freshVerification" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "workerId" TEXT,
  "claimedAt" TIMESTAMP(3),
  "heartbeatAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatchApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatchApplication_agentRunId_patchSha256_expectedHeadSha_key" ON "PatchApplication"("agentRunId", "patchSha256", "expectedHeadSha");
CREATE INDEX "PatchApplication_agentRunId_idx" ON "PatchApplication"("agentRunId");
CREATE INDEX "PatchApplication_repositoryId_createdAt_idx" ON "PatchApplication"("repositoryId", "createdAt");
CREATE INDEX "PatchApplication_status_createdAt_idx" ON "PatchApplication"("status", "createdAt");
CREATE INDEX "PatchApplication_patchSha256_idx" ON "PatchApplication"("patchSha256");
CREATE INDEX "AgentRun_patchSha256_idx" ON "AgentRun"("patchSha256");

ALTER TABLE "PatchApplication" ADD CONSTRAINT "PatchApplication_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatchApplication" ADD CONSTRAINT "PatchApplication_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatchApplication" ADD CONSTRAINT "PatchApplication_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
