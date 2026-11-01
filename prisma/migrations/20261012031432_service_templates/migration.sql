-- CreateTable
CREATE TABLE "TemplateItem" (
    "id" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "type" "PlanItemType" NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "lengthSeconds" INTEGER,

    CONSTRAINT "TemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplatePosition" (
    "id" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TemplatePosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplateItem_serviceTypeId_position_idx" ON "TemplateItem"("serviceTypeId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TemplatePosition_serviceTypeId_positionId_key" ON "TemplatePosition"("serviceTypeId", "positionId");

-- AddForeignKey
ALTER TABLE "TemplateItem" ADD CONSTRAINT "TemplateItem_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplatePosition" ADD CONSTRAINT "TemplatePosition_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplatePosition" ADD CONSTRAINT "TemplatePosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
