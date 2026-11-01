-- CreateTable
CREATE TABLE "PlanTime" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time" TEXT NOT NULL,

    CONSTRAINT "PlanTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateTime" (
    "id" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "daysBefore" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TemplateTime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanTime_planId_idx" ON "PlanTime"("planId");

-- CreateIndex
CREATE INDEX "TemplateTime_serviceTypeId_idx" ON "TemplateTime"("serviceTypeId");

-- AddForeignKey
ALTER TABLE "PlanTime" ADD CONSTRAINT "PlanTime_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateTime" ADD CONSTRAINT "TemplateTime_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
