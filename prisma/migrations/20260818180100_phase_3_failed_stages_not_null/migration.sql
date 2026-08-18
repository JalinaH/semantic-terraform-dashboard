-- Keep Prisma's required scalar-list contract enforced in PostgreSQL.
ALTER TABLE "RepositoryConfig"
  ALTER COLUMN "failedStages" SET NOT NULL;
