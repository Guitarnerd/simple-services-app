-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "maxPerMonth" INTEGER,
ADD COLUMN     "preferredWeeks" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "ServingPartner" (
    "personAId" TEXT NOT NULL,
    "personBId" TEXT NOT NULL,
    "always" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServingPartner_pkey" PRIMARY KEY ("personAId","personBId")
);

-- CreateIndex
CREATE INDEX "ServingPartner_personBId_idx" ON "ServingPartner"("personBId");

-- AddForeignKey
ALTER TABLE "ServingPartner" ADD CONSTRAINT "ServingPartner_personAId_fkey" FOREIGN KEY ("personAId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServingPartner" ADD CONSTRAINT "ServingPartner_personBId_fkey" FOREIGN KEY ("personBId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
