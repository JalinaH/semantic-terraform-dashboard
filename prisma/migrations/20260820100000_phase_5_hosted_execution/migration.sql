-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED');

-- AlterEnum
ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'VERIFICATION_SKIPPED';

-- AlterTable
ALTER TABLE "RepositoryConfig"
  ADD COLUMN "workflowNames" TEXT[] NOT NULL DEFAULT ARRAY['Terraform', 'Terraform CI', 'Infrastructure Plan']::TEXT[],
  ADD COLUMN "workflowNamePatterns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "terraformPathPatterns" TEXT[] NOT NULL DEFAULT ARRAY['**/*.tf', '**/*.tf.json']::TEXT[];

-- CreateTable
CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "action" TEXT,
  "repositoryId" TEXT,
  "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
  "outcome" TEXT,
  "skipReason" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- Expand AgentRun before enforcing the new queue contract.
DROP INDEX IF EXISTS "AgentRun_githubRunId_key";

ALTER TABLE "AgentRun"
  ADD COLUMN "githubInstallationId" TEXT,
  ADD COLUMN "githubEventType" TEXT,
  ADD COLUMN "githubDeliveryId" TEXT,
  ADD COLUMN "githubRunAttempt" INTEGER,
  ADD COLUMN "githubWorkflowName" TEXT,
  ADD COLUMN "baseSha" TEXT,
  ADD COLUMN "headSha" TEXT,
  ADD COLUMN "branch" TEXT,
  ADD COLUMN "comparisonFallback" TEXT,
  ADD COLUMN "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN "skipReason" TEXT,
  ADD COLUMN "modelProvider" "ModelProvider",
  ADD COLUMN "model" TEXT,
  ADD COLUMN "maxRepairAttempts" INTEGER,
  ADD COLUMN "affectedResources" JSONB,
  ADD COLUMN "attempts" JSONB,
  ADD COLUMN "timing" JSONB,
  ADD COLUMN "tokenUsage" JSONB,
  ADD COLUMN "eventMetadata" JSONB,
  ADD COLUMN "configSnapshot" JSONB,
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "workerId" TEXT,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

UPDATE "AgentRun" AS run
SET
  "githubInstallationId" = repository."installationId",
  "githubEventType" = 'legacy',
  "githubDeliveryId" = 'legacy-' || run."id",
  "githubRunAttempt" = CASE WHEN run."githubRunId" IS NULL THEN NULL ELSE 1 END,
  "status" = 'COMPLETED',
  "modelProvider" = 'GEMINI',
  "model" = 'gemini-3.6-flash',
  "maxRepairAttempts" = 1,
  "configSnapshot" = jsonb_build_object(
    'terraformDir', '.',
    'terraformVersion', '1.15.7',
    'modelProvider', 'gemini',
    'model', 'gemini-3.6-flash',
    'contextMode', 'auto',
    'maxRepairAttempts', 1,
    'failedStages', jsonb_build_array('plan')
  ),
  "affectedResources" = CASE
    WHEN run."affectedResource" IS NULL THEN NULL
    ELSE jsonb_build_array(run."affectedResource")
  END,
  "attempts" = run."attemptHistory",
  "timing" = CASE
    WHEN run."totalRuntimeMs" IS NULL THEN NULL
    ELSE jsonb_build_object('total_ms', run."totalRuntimeMs")
  END,
  "tokenUsage" = jsonb_strip_nulls(jsonb_build_object(
    'input_tokens', run."inputTokens",
    'output_tokens', run."outputTokens"
  )),
  "startedAt" = run."createdAt",
  "completedAt" = run."updatedAt"
FROM "Repository" AS repository
WHERE repository."id" = run."repositoryId";

INSERT INTO "WebhookDelivery" (
  "id", "deliveryId", "eventName", "repositoryId", "status", "outcome", "receivedAt", "processedAt"
)
SELECT
  'legacy-' || run."id",
  run."githubDeliveryId",
  'legacy',
  run."repositoryId",
  'PROCESSED',
  'legacy_run',
  run."createdAt",
  run."updatedAt"
FROM "AgentRun" AS run;

ALTER TABLE "AgentRun"
  ALTER COLUMN "githubInstallationId" SET NOT NULL,
  ALTER COLUMN "githubEventType" SET NOT NULL,
  ALTER COLUMN "githubDeliveryId" SET NOT NULL,
  ALTER COLUMN "modelProvider" SET NOT NULL,
  ALTER COLUMN "model" SET NOT NULL,
  ALTER COLUMN "maxRepairAttempts" SET NOT NULL,
  ALTER COLUMN "configSnapshot" SET NOT NULL,
  ALTER COLUMN "contextMode" TYPE "RepositoryContextMode"
    USING (
      CASE "contextMode"::TEXT
        WHEN 'MINIMAL' THEN 'LIGHTWEIGHT'
        WHEN 'FULL' THEN 'SCHEMA_AWARE'
        ELSE 'AUTO'
      END
    )::"RepositoryContextMode";

ALTER TABLE "AgentRun"
  DROP COLUMN "affectedResource",
  DROP COLUMN "attemptHistory";

DROP TYPE "ContextMode";

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_deliveryId_key" ON "WebhookDelivery"("deliveryId");
CREATE INDEX "WebhookDelivery_repositoryId_receivedAt_idx" ON "WebhookDelivery"("repositoryId", "receivedAt");
CREATE INDEX "WebhookDelivery_status_receivedAt_idx" ON "WebhookDelivery"("status", "receivedAt");
CREATE UNIQUE INDEX "AgentRun_githubDeliveryId_key" ON "AgentRun"("githubDeliveryId");
CREATE UNIQUE INDEX "AgentRun_repositoryId_githubRunId_githubRunAttempt_key" ON "AgentRun"("repositoryId", "githubRunId", "githubRunAttempt");
CREATE INDEX "AgentRun_githubInstallationId_idx" ON "AgentRun"("githubInstallationId");
CREATE INDEX "AgentRun_status_createdAt_idx" ON "AgentRun"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "WebhookDelivery"
  ADD CONSTRAINT "WebhookDelivery_repositoryId_fkey"
  FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_githubInstallationId_fkey"
  FOREIGN KEY ("githubInstallationId") REFERENCES "GitHubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_githubDeliveryId_fkey"
  FOREIGN KEY ("githubDeliveryId") REFERENCES "WebhookDelivery"("deliveryId") ON DELETE CASCADE ON UPDATE CASCADE;
