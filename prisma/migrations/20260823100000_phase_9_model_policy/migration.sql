CREATE TYPE "UserAccessLevel" AS ENUM ('FREE', 'PRO', 'ADVANCED');
CREATE TYPE "ModelTier" AS ENUM ('FREE', 'ECONOMY', 'BALANCED', 'PREMIUM');
CREATE TYPE "ModelRouting" AS ENUM ('AUTO', 'FIXED');

ALTER TYPE "ModelProvider" ADD VALUE 'OPENROUTER';

ALTER TABLE "User" ADD COLUMN "accessLevel" "UserAccessLevel" NOT NULL DEFAULT 'FREE';

ALTER TABLE "RepositoryConfig"
  ADD COLUMN "modelRouting" "ModelRouting" NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "maxModelTier" "ModelTier" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "fixedModelId" TEXT,
  ADD COLUMN "modelPolicyVersion" TEXT NOT NULL DEFAULT 'legacy_phase8',
  ADD COLUMN "accessLevelSnapshot" "UserAccessLevel" NOT NULL DEFAULT 'FREE';

UPDATE "RepositoryConfig" SET "fixedModelId" = "model" WHERE "fixedModelId" IS NULL;

ALTER TABLE "AgentRun"
  ADD COLUMN "configuredModelRouting" "ModelRouting",
  ADD COLUMN "configuredMaxModelTier" "ModelTier",
  ADD COLUMN "configuredModelId" TEXT,
  ADD COLUMN "accountAccessLevel" "UserAccessLevel",
  ADD COLUMN "modelPolicyVersion" TEXT,
  ADD COLUMN "catalogSyncedAt" TIMESTAMP(3);

CREATE TABLE "ModelCatalogEntry" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "canonicalSlug" TEXT,
  "displayName" TEXT NOT NULL,
  "description" TEXT,
  "tier" "ModelTier",
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "recommended" BOOLEAN NOT NULL DEFAULT false,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "isFree" BOOLEAN,
  "supportsStructuredOutput" BOOLEAN NOT NULL DEFAULT false,
  "supportsJsonFallback" BOOLEAN NOT NULL DEFAULT false,
  "contextLength" INTEGER,
  "pricingPromptPerMillion" DECIMAL(20,10),
  "pricingOutputPerMillion" DECIMAL(20,10),
  "upstreamProvider" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "policyVersion" TEXT NOT NULL DEFAULT 'terrafix_model_policy_v1',
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelCatalogEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModelCatalogSync" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "lastAttemptAt" TIMESTAMP(3),
  "lastSuccessfulAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "modelsReceived" INTEGER,
  "modelsNormalized" INTEGER,
  "modelsEnabled" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelCatalogSync_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelCatalogEntry_provider_modelId_key" ON "ModelCatalogEntry"("provider", "modelId");
CREATE INDEX "ModelCatalogEntry_provider_idx" ON "ModelCatalogEntry"("provider");
CREATE INDEX "ModelCatalogEntry_enabled_available_idx" ON "ModelCatalogEntry"("enabled", "available");
CREATE INDEX "ModelCatalogEntry_tier_enabled_idx" ON "ModelCatalogEntry"("tier", "enabled");
CREATE INDEX "ModelCatalogEntry_isFree_idx" ON "ModelCatalogEntry"("isFree");
CREATE UNIQUE INDEX "ModelCatalogSync_provider_key" ON "ModelCatalogSync"("provider");
