ALTER TABLE "AgentRun"
  ADD COLUMN "mutationEligibilityLevel" TEXT,
  ADD COLUMN "verificationOutcome" TEXT,
  ADD COLUMN "assessmentPatchCheckPassed" BOOLEAN,
  ADD COLUMN "assessmentPatchApplyPassed" BOOLEAN,
  ADD COLUMN "assessmentFmtPassed" BOOLEAN,
  ADD COLUMN "assessmentInitPassed" BOOLEAN,
  ADD COLUMN "assessmentValidatePassed" BOOLEAN,
  ADD COLUMN "assessmentPlanAttempted" BOOLEAN,
  ADD COLUMN "assessmentPlanPassed" BOOLEAN,
  ADD COLUMN "assessmentFullVerificationPassed" BOOLEAN,
  ADD COLUMN "applySafety" TEXT,
  ADD COLUMN "planFailureClass" TEXT,
  ADD COLUMN "planFailureReasonCode" TEXT,
  ADD COLUMN "planFailureSummary" TEXT,
  ADD COLUMN "planFailureDetail" TEXT,
  ADD COLUMN "planFailureSourceFile" TEXT,
  ADD COLUMN "planFailureSourceLine" INTEGER,
  ADD COLUMN "planFailureResourceAddress" TEXT,
  ADD COLUMN "planDiagnosticFormat" TEXT;

ALTER TABLE "PatchApplication"
  ADD COLUMN "eligibilityLevel" TEXT,
  ADD COLUMN "verificationOutcomeAtRequest" TEXT,
  ADD COLUMN "conditionalApproval" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "planFailureClassAtRequest" TEXT,
  ADD COLUMN "planFailureReasonCodeAtRequest" TEXT;

CREATE INDEX "AgentRun_verificationOutcome_createdAt_idx"
  ON "AgentRun"("verificationOutcome", "createdAt");
