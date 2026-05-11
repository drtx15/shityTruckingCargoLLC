CREATE TYPE "OrganizationType" AS ENUM ('SHIPPER', 'CARRIER', 'BROKER', 'PLATFORM');
CREATE TYPE "OrganizationUserRole" AS ENUM ('OWNER', 'MANAGER', 'DISPATCHER', 'DRIVER', 'ACCOUNTING', 'VIEWER');
CREATE TYPE "VerificationStatus" AS ENUM ('NOT_REQUIRED', 'PENDING_REVIEW', 'VERIFIED', 'NEEDS_ATTENTION', 'REJECTED');
CREATE TYPE "DocketPrefix" AS ENUM ('MC', 'FF', 'MX');

CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "legalName" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "dotNumber" TEXT,
    "docketPrefix" "DocketPrefix",
    "docketNumber" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "organizationId" INTEGER;
ALTER TABLE "User" ADD COLUMN "organizationRole" "OrganizationUserRole" NOT NULL DEFAULT 'OWNER';

CREATE INDEX "Organization_type_verificationStatus_idx" ON "Organization"("type", "verificationStatus");
CREATE INDEX "Organization_dotNumber_idx" ON "Organization"("dotNumber");
CREATE INDEX "Organization_docketPrefix_docketNumber_idx" ON "Organization"("docketPrefix", "docketNumber");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
