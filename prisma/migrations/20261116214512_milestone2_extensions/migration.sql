-- AlterTable
ALTER TABLE "ConstraintRule" ADD COLUMN     "enforcement" TEXT NOT NULL DEFAULT 'SOFT_WARN';

-- AlterTable
ALTER TABLE "TemplateEntry" ADD COLUMN     "customEndTime" TEXT,
ADD COLUMN     "customStartTime" TEXT;
