-- AlterTable
ALTER TABLE "Person" DROP COLUMN IF EXISTS "maxHoursPerWeek",
DROP COLUMN IF EXISTS "maxShiftsPerWeek";

-- Clean up legacy resident-style rules if present
DELETE FROM "ConstraintRule"
WHERE "ruleType" = 'WORKLOAD_CAP'
   OR ("ruleType" = 'MUTUAL_EXCLUSION_AND_REST' AND COALESCE("config"->>'mode', 'MIN_REST_HOURS') = 'MIN_REST_HOURS');

UPDATE "ConstraintRule"
SET "ruleType" = 'SAME_DAY_EXCLUSION'
WHERE "ruleType" = 'MUTUAL_EXCLUSION_AND_REST'
  AND "config"->>'mode' = 'SAME_DAY_EXCLUSION';
