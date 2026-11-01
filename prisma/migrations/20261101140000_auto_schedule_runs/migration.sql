-- CreateTable
CREATE TABLE "AutoScheduleRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoScheduleRun_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN "autoRunId" TEXT;

-- CreateIndex
CREATE INDEX "AutoScheduleRun_organizationId_idx" ON "AutoScheduleRun"("organizationId");

-- CreateIndex
CREATE INDEX "Assignment_autoRunId_idx" ON "Assignment"("autoRunId");

-- AddForeignKey
ALTER TABLE "AutoScheduleRun" ADD CONSTRAINT "AutoScheduleRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_autoRunId_fkey" FOREIGN KEY ("autoRunId") REFERENCES "AutoScheduleRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
