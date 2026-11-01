-- Pre-service moves from a tick on each row to a tick on a header: everything under
-- a Pre-service header is timed back from the start.
ALTER TABLE "TemplateItem" ADD COLUMN "preService" BOOLEAN NOT NULL DEFAULT false;

-- Rows that were ticked one by one go, in their order, under a new "Pre-service"
-- header at the top of their plan.
CREATE TEMP TABLE ticked AS
SELECT i.id, i."planId",
       ROW_NUMBER() OVER (PARTITION BY i."planId" ORDER BY i.position) AS rank,
       COUNT(*) OVER (PARTITION BY i."planId") AS total,
       (SELECT MIN(p.position) FROM "PlanItem" p WHERE p."planId" = i."planId") AS top
FROM "PlanItem" i
WHERE i."preService" AND i.type <> 'HEADER';

INSERT INTO "PlanItem" (id, "planId", type, position, title, "preService", tag)
SELECT 'pre' || md5(random()::text || "planId"), "planId", 'HEADER'::"PlanItemType", MIN(top) - MIN(total) - 1, 'Pre-service', true, false
FROM ticked
GROUP BY "planId";

UPDATE "PlanItem" SET position = ticked.top - ticked.total - 1 + ticked.rank, "preService" = false
FROM ticked
WHERE "PlanItem".id = ticked.id;

DROP TABLE ticked;
