CREATE TYPE "AwsOnboardingSessionStatus" AS ENUM (
  'PENDING',
  'STACK_LAUNCHED',
  'CALLBACK_RECEIVED',
  'VERIFYING',
  'CONNECTED',
  'EXPIRED',
  'FAILED'
);

CREATE TABLE "AwsOnboardingSession" (
  "id" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "installationId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "callbackTokenHash" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "status" "AwsOnboardingSessionStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "callbackReceivedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "roleArn" TEXT,
  "awsAccountId" TEXT,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AwsOnboardingSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AwsOnboardingSession_externalId_key" ON "AwsOnboardingSession"("externalId");
CREATE UNIQUE INDEX "AwsOnboardingSession_callbackTokenHash_key" ON "AwsOnboardingSession"("callbackTokenHash");
CREATE INDEX "AwsOnboardingSession_repositoryId_createdAt_idx" ON "AwsOnboardingSession"("repositoryId", "createdAt");
CREATE INDEX "AwsOnboardingSession_userId_repositoryId_idx" ON "AwsOnboardingSession"("userId", "repositoryId");
CREATE INDEX "AwsOnboardingSession_status_expiresAt_idx" ON "AwsOnboardingSession"("status", "expiresAt");

ALTER TABLE "AwsOnboardingSession"
  ADD CONSTRAINT "AwsOnboardingSession_repositoryId_fkey"
  FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AwsOnboardingSession"
  ADD CONSTRAINT "AwsOnboardingSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AwsOnboardingSession"
  ADD CONSTRAINT "AwsOnboardingSession_installationId_fkey"
  FOREIGN KEY ("installationId") REFERENCES "GitHubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
