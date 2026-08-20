-- CreateEnum
CREATE TYPE "AWSConnectionStatus_new" AS ENUM ('PENDING', 'CONNECTED', 'VERIFICATION_FAILED', 'ACCESS_REMOVED');

-- AlterTable
ALTER TABLE "AWSConnection"
  ADD COLUMN "externalId" TEXT,
  ADD COLUMN "awsAccountId" TEXT,
  ADD COLUMN "lastVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "verificationError" TEXT,
  ALTER COLUMN "roleArn" DROP NOT NULL,
  ALTER COLUMN "status" DROP DEFAULT;

-- Existing preview rows receive a one-time high-entropy identifier. New values
-- are generated server-side with Node's cryptographic random source.
UPDATE "AWSConnection"
SET "externalId" = 'stfa_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "externalId" IS NULL;

ALTER TABLE "AWSConnection"
  ALTER COLUMN "externalId" SET NOT NULL,
  ALTER COLUMN "status" TYPE "AWSConnectionStatus_new"
  USING (
    CASE "status"::text
      WHEN 'CONNECTED' THEN 'CONNECTED'
      WHEN 'ATTENTION' THEN 'VERIFICATION_FAILED'
      WHEN 'DISCONNECTED' THEN 'ACCESS_REMOVED'
      ELSE 'PENDING'
    END
  )::"AWSConnectionStatus_new";

DROP TYPE "AWSConnectionStatus";
ALTER TYPE "AWSConnectionStatus_new" RENAME TO "AWSConnectionStatus";

ALTER TABLE "AWSConnection"
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "AWSConnection_externalId_key" ON "AWSConnection"("externalId");
CREATE INDEX "AWSConnection_status_idx" ON "AWSConnection"("status");
CREATE INDEX "AWSConnection_awsAccountId_idx" ON "AWSConnection"("awsAccountId");
