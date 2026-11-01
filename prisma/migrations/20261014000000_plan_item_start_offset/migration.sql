-- A plan row can start a set time before the service: -600 is 10 minutes before.
ALTER TABLE "PlanItem" ADD COLUMN "startOffsetSeconds" INTEGER;
