-- CreateTable
CREATE TABLE "PlanPosition" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "optional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlanPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanPosition_planId_positionId_key" ON "PlanPosition"("planId", "positionId");

-- AddForeignKey
ALTER TABLE "PlanPosition" ADD CONSTRAINT "PlanPosition_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPosition" ADD CONSTRAINT "PlanPosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
