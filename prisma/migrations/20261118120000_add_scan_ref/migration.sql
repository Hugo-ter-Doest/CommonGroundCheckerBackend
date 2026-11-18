-- AlterTable
ALTER TABLE "Repo" ADD COLUMN     "scanRef" TEXT;

-- AlterTable
ALTER TABLE "RepoAnalysis" ADD COLUMN     "scannedRef" TEXT,
ADD COLUMN     "scannedRefKind" TEXT,
ADD COLUMN     "scannedCommit" TEXT;
