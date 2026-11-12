-- AlterTable
ALTER TABLE "RepoAnalysis" ADD COLUMN     "aspectRatings" JSONB,
ADD COLUMN     "categoryRatings" JSONB,
ADD COLUMN     "endorsement" JSONB,
ADD COLUMN     "rating" DOUBLE PRECISION;
