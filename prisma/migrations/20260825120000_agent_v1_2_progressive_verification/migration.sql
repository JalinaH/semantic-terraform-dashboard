ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'LOCALLY_VALIDATED_FIRST_ATTEMPT';
ALTER TYPE "VerificationStatus" ADD VALUE IF NOT EXISTS 'LOCALLY_VALIDATED_AFTER_RETRY';

ALTER TABLE "AgentRun"
  ADD COLUMN "verificationMode" TEXT,
  ADD COLUMN "assessmentPlanRequested" BOOLEAN,
  ADD COLUMN "planSkipReason" TEXT;

ALTER TABLE "PatchApplication"
  ADD COLUMN "verificationModeAtRequest" TEXT,
  ADD COLUMN "planRequestedAtRequest" BOOLEAN,
  ADD COLUMN "conditionalApprovalKind" TEXT,
  ADD COLUMN "freshVerificationMode" TEXT;
