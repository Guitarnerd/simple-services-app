-- A song played as its tag in this plan.
ALTER TABLE "PlanItem" ADD COLUMN "tag" BOOLEAN NOT NULL DEFAULT false;
