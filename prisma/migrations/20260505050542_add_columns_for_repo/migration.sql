-- CreateTable
CREATE TABLE "RepoAnalysis" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "scoringConfigId" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "version" TEXT,
    "score" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repo" (
    "id" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "defaultBranch" TEXT,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "license" TEXT,
    "version" TEXT,
    "versionEvidenceSource" TEXT,
    "versionEvidenceDetail" TEXT,
    "helmChartLocations" TEXT[],
    "dockerLocations" TEXT[],
    "apiSpecificationLocations" TEXT[],
    "documentationLocations" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringConfig" (
    "id" TEXT NOT NULL,
    "criterionWeights" JSONB NOT NULL,
    "criterionRequirementLevels" JSONB NOT NULL DEFAULT '{}',
    "complexityThreshold" INTEGER NOT NULL DEFAULT 15,
    "complexityMaxCcnThreshold" INTEGER NOT NULL DEFAULT 30,
    "spectralRulesetSource" TEXT NOT NULL DEFAULT 'https://static.developer.overheid.nl/adr/ruleset.yaml',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepoAnalysis_repoId_idx" ON "RepoAnalysis"("repoId");

-- CreateIndex
CREATE INDEX "RepoAnalysis_scoringConfigId_idx" ON "RepoAnalysis"("scoringConfigId");

-- CreateIndex
CREATE INDEX "RepoAnalysis_createdAt_idx" ON "RepoAnalysis"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Repo_repoUrl_key" ON "Repo"("repoUrl");

-- CreateIndex
CREATE INDEX "Repo_owner_idx" ON "Repo"("owner");

-- CreateIndex
CREATE INDEX "Repo_name_idx" ON "Repo"("name");

-- AddForeignKey
ALTER TABLE "RepoAnalysis" ADD CONSTRAINT "RepoAnalysis_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoAnalysis" ADD CONSTRAINT "RepoAnalysis_scoringConfigId_fkey" FOREIGN KEY ("scoringConfigId") REFERENCES "ScoringConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
