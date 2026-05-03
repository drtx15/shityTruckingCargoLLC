CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'DRIVER', 'DISPATCHER', 'FLEET_MANAGER', 'BROKER', 'ADMIN');

ALTER TABLE "User"
ALTER COLUMN "password" DROP NOT NULL,
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN "shipperId" INTEGER,
ADD COLUMN "truckId" INTEGER;

CREATE TABLE "AuthCode" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_shipperId_idx" ON "User"("shipperId");
CREATE INDEX "User_truckId_idx" ON "User"("truckId");
CREATE INDEX "AuthCode_email_consumedAt_expiresAt_idx" ON "AuthCode"("email", "consumedAt", "expiresAt");
CREATE INDEX "AuthCode_userId_consumedAt_idx" ON "AuthCode"("userId", "consumedAt");

ALTER TABLE "User"
ADD CONSTRAINT "User_shipperId_fkey"
FOREIGN KEY ("shipperId") REFERENCES "Shipper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_truckId_fkey"
FOREIGN KEY ("truckId") REFERENCES "Truck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuthCode"
ADD CONSTRAINT "AuthCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
