-- A "Pre-service" tick replaces the "Before start" minutes.
ALTER TABLE "PlanItem" ADD COLUMN "preService" BOOLEAN NOT NULL DEFAULT false;
UPDATE "PlanItem" SET "preService" = true WHERE "startOffsetSeconds" < 0;
ALTER TABLE "PlanItem" DROP COLUMN "startOffsetSeconds";
