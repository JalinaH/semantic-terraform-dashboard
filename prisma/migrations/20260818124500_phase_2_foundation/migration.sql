-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('USER', 'ORGANIZATION');
CREATE TYPE "RepositorySelection" AS ENUM ('ALL', 'SELECTED');
CREATE TYPE "ContextMode" AS ENUM ('MINIMAL', 'SMART', 'FULL');
CREATE TYPE "AWSConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'ATTENTION', 'DISCONNECTED');
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED_FIRST_ATTEMPT', 'VERIFIED_AFTER_RETRY', 'VERIFICATION_FAILED', 'PATCH_REJECTED', 'VERIFICATION_UNAVAILABLE', 'PENDING');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "githubUserId" TEXT,
    "githubLogin" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GitHubInstallation" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "accountId" TEXT,
    "accountLogin" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "repositorySelection" "RepositorySelection" NOT NULL,
    "htmlUrl" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GitHubInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserInstallation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "githubInstallationId" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Repository" (
    "id" TEXT NOT NULL,
    "githubRepositoryId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "private" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "accessible" BOOLEAN NOT NULL DEFAULT true,
    "removedAt" TIMESTAMP(3),
    "installationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "refresh_token_expires_in" INTEGER,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "RepositoryConfig" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "terraformDir" TEXT NOT NULL DEFAULT '.',
    "terraformVersion" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gemini-2.5-pro',
    "contextMode" "ContextMode" NOT NULL DEFAULT 'SMART',
    "maxRepairAttempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RepositoryConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AWSConnection" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "roleArn" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" "AWSConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AWSConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "githubRunId" TEXT,
    "pullRequestNumber" INTEGER,
    "commitSha" TEXT NOT NULL,
    "failedStage" TEXT,
    "affectedResource" TEXT,
    "contextMode" "ContextMode" NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "modelConfidence" DOUBLE PRECISION,
    "evidenceScore" DOUBLE PRECISION,
    "totalRuntimeMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "rootCause" TEXT,
    "violatedConstraint" TEXT,
    "suggestedPatch" TEXT,
    "attemptHistory" JSONB,
    "verificationDetails" JSONB,
    "safeResultPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_githubUserId_key" ON "User"("githubUserId");
CREATE INDEX "User_githubLogin_idx" ON "User"("githubLogin");
CREATE UNIQUE INDEX "GitHubInstallation_installationId_key" ON "GitHubInstallation"("installationId");
CREATE INDEX "GitHubInstallation_accountId_idx" ON "GitHubInstallation"("accountId");
CREATE INDEX "GitHubInstallation_accountLogin_idx" ON "GitHubInstallation"("accountLogin");
CREATE INDEX "UserInstallation_githubInstallationId_idx" ON "UserInstallation"("githubInstallationId");
CREATE UNIQUE INDEX "UserInstallation_userId_githubInstallationId_key" ON "UserInstallation"("userId", "githubInstallationId");
CREATE UNIQUE INDEX "Repository_githubRepositoryId_key" ON "Repository"("githubRepositoryId");
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");
CREATE INDEX "Repository_installationId_idx" ON "Repository"("installationId");
CREATE INDEX "Repository_installationId_accessible_idx" ON "Repository"("installationId", "accessible");
CREATE INDEX "Repository_owner_name_idx" ON "Repository"("owner", "name");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
CREATE UNIQUE INDEX "RepositoryConfig_repositoryId_key" ON "RepositoryConfig"("repositoryId");
CREATE UNIQUE INDEX "AWSConnection_repositoryId_key" ON "AWSConnection"("repositoryId");
CREATE UNIQUE INDEX "AgentRun_githubRunId_key" ON "AgentRun"("githubRunId");
CREATE INDEX "AgentRun_repositoryId_createdAt_idx" ON "AgentRun"("repositoryId", "createdAt");
CREATE INDEX "AgentRun_verificationStatus_createdAt_idx" ON "AgentRun"("verificationStatus", "createdAt");
CREATE INDEX "AgentRun_commitSha_idx" ON "AgentRun"("commitSha");
CREATE INDEX "AgentRun_repositoryId_pullRequestNumber_idx" ON "AgentRun"("repositoryId", "pullRequestNumber");

-- AddForeignKey
ALTER TABLE "UserInstallation" ADD CONSTRAINT "UserInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInstallation" ADD CONSTRAINT "UserInstallation_githubInstallationId_fkey" FOREIGN KEY ("githubInstallationId") REFERENCES "GitHubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Repository" ADD CONSTRAINT "Repository_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepositoryConfig" ADD CONSTRAINT "RepositoryConfig_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AWSConnection" ADD CONSTRAINT "AWSConnection_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
