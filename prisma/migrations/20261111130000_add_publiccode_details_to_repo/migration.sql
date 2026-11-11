-- AlterTable
ALTER TABLE "Repo" ADD COLUMN     "developmentStatus" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "maintainers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "maintenanceType" TEXT,
ADD COLUMN     "shortDescription" TEXT;
