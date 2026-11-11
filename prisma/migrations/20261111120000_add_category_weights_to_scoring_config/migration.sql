-- AlterTable
ALTER TABLE "ScoringConfig" ADD COLUMN     "categoryWeights" JSONB NOT NULL DEFAULT '{}';
