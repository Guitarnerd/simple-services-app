-- A time that hasn't been decided yet has no date and no clock time.
ALTER TABLE "PlanTime" ALTER COLUMN "date" DROP NOT NULL,
ALTER COLUMN "time" DROP NOT NULL;

ALTER TABLE "TemplateTime" ALTER COLUMN "time" DROP NOT NULL;
