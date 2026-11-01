-- A church's own logo for the top of the sidebar.
ALTER TABLE "Organization" ADD COLUMN "logoUpdatedAt" TIMESTAMP(3);

CREATE TABLE "ChurchLogo" (
    "organizationId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL,
    CONSTRAINT "ChurchLogo_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "ChurchLogo" ADD CONSTRAINT "ChurchLogo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
