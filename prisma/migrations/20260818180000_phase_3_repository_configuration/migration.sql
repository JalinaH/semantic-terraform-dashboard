-- CreateEnum
CREATE TYPE "RepositoryContextMode" AS ENUM ('AUTO', 'LIGHTWEIGHT', 'SCHEMA_AWARE');

-- CreateEnum
CREATE TYPE "ModelProvider" AS ENUM ('GEMINI');

-- CreateEnum
CREATE TYPE "FailureStage" AS ENUM ('VALIDATE', 'PLAN');

-- AlterTable
ALTER TABLE "RepositoryConfig"
  ADD COLUMN "modelProvider" "ModelProvider" NOT NULL DEFAULT 'GEMINI',
  ADD COLUMN "triggerOnPullRequest" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "triggerOnPush" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "failedStages" "FailureStage"[] DEFAULT ARRAY['PLAN']::"FailureStage"[];

UPDATE "RepositoryConfig"
SET
  "terraformVersion" = COALESCE("terraformVersion", '1.15.7'),
  "model" = CASE
    WHEN "model" IN ('gemini-2.5-pro', 'gemini-2.5-flash') THEN 'gemini-3.6-flash'
    ELSE "model"
  END;

ALTER TABLE "RepositoryConfig"
  ALTER COLUMN "terraformVersion" SET DEFAULT '1.15.7',
  ALTER COLUMN "terraformVersion" SET NOT NULL,
  ALTER COLUMN "model" SET DEFAULT 'gemini-3.6-flash',
  ALTER COLUMN "contextMode" DROP DEFAULT;

ALTER TABLE "RepositoryConfig"
  ALTER COLUMN "contextMode" TYPE "RepositoryContextMode"
  USING (
    CASE "contextMode"::text
      WHEN 'MINIMAL' THEN 'LIGHTWEIGHT'
      WHEN 'FULL' THEN 'SCHEMA_AWARE'
      ELSE 'AUTO'
    END
  )::"RepositoryContextMode";

ALTER TABLE "RepositoryConfig"
  ALTER COLUMN "contextMode" SET DEFAULT 'AUTO';

ALTER TABLE "RepositoryConfig"
  ADD CONSTRAINT "RepositoryConfig_maxRepairAttempts_check"
  CHECK ("maxRepairAttempts" BETWEEN 0 AND 1);
