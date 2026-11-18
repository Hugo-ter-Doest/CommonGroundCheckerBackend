-- AlterTable
ALTER TABLE "Repo" ADD COLUMN     "checkIntervalHours" INTEGER,
ADD COLUMN     "followed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "nextCheckAt" TIMESTAMP(3);

-- Existing repositories start with the time of their latest stored analysis.
UPDATE "Repo" r
SET "lastCheckedAt" = latest."checkedAt"
FROM (
    SELECT "repoId", MAX("checkedAt") AS "checkedAt"
    FROM "RepoAnalysis"
    GROUP BY "repoId"
) latest
WHERE latest."repoId" = r."id";

-- CreateIndex
CREATE INDEX "Repo_nextCheckAt_idx" ON "Repo"("nextCheckAt");
