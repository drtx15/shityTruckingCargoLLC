-- Extend existing enums used by the shipment lifecycle.
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'DELAYED';
ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TYPE "CheckpointType" ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE "CheckpointType" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "CheckpointType" ADD VALUE IF NOT EXISTS 'DELAYED';
ALTER TYPE "CheckpointType" ADD VALUE IF NOT EXISTS 'RESUMED';
ALTER TYPE "CheckpointType" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "CheckpointType" ADD VALUE IF NOT EXISTS 'FAILED_DELIVERY';
ALTER TYPE "CheckpointType" ADD VALUE IF NOT EXISTS 'MANUAL_NOTE';

-- New enums for platform-grade logistics workflows.
CREATE TYPE "ShipmentPriority" AS ENUM ('STANDARD', 'EXPRESS', 'URGENT');
CREATE TYPE "WebhookAttemptState" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'RETRYING');

-- Shipper accounts own shipments and webhook subscriptions.
CREATE TABLE "Shipper" (
    "id" SERIAL NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "apiKeyPrefix" TEXT,
    "apiKeyHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipper_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Shipper_contactEmail_key" ON "Shipper"("contactEmail");
CREATE INDEX "Shipper_isActive_companyName_idx" ON "Shipper"("isActive", "companyName");

-- Fleet metadata used by assignment rules.
ALTER TABLE "Truck"
ADD COLUMN "driverName" TEXT,
ADD COLUMN "maxWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 10000,
ADD COLUMN "currentLoadKg" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX "Truck_status_currentLat_currentLng_idx" ON "Truck"("status", "currentLat", "currentLng");

-- Shipment business metadata, public tracking, SLA, and proof-of-delivery fields.
ALTER TABLE "Shipment"
ADD COLUMN "trackingCode" TEXT,
ADD COLUMN "shipperId" INTEGER,
ADD COLUMN "priority" "ShipmentPriority" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "cargoDescription" TEXT,
ADD COLUMN "weightKg" DOUBLE PRECISION NOT NULL DEFAULT 1000,
ADD COLUMN "slaDeadline" TIMESTAMP(3),
ADD COLUMN "deliveryDeadline" TIMESTAMP(3),
ADD COLUMN "delayReason" TEXT,
ADD COLUMN "delayedAt" TIMESTAMP(3),
ADD COLUMN "proofRecipientName" TEXT,
ADD COLUMN "proofDeliveryNote" TEXT,
ADD COLUMN "proofDeliveredAt" TIMESTAMP(3),
ADD COLUMN "proofReferenceUrl" TEXT;

UPDATE "Shipment"
SET "trackingCode" = 'TRK-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || LPAD("id"::TEXT, 6, '0')
WHERE "trackingCode" IS NULL;

ALTER TABLE "Shipment" ALTER COLUMN "trackingCode" SET NOT NULL;

CREATE UNIQUE INDEX "Shipment_trackingCode_key" ON "Shipment"("trackingCode");
CREATE INDEX "Shipment_shipperId_createdAt_idx" ON "Shipment"("shipperId", "createdAt");
CREATE INDEX "Shipment_status_priority_createdAt_idx" ON "Shipment"("status", "priority", "createdAt");
CREATE INDEX "Shipment_assignedTruckId_status_idx" ON "Shipment"("assignedTruckId", "status");

ALTER TABLE "Shipment"
ADD CONSTRAINT "Shipment_shipperId_fkey"
FOREIGN KEY ("shipperId") REFERENCES "Shipper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ETA accuracy and audit history.
CREATE TABLE "EtaHistory" (
    "id" SERIAL NOT NULL,
    "shipmentId" INTEGER NOT NULL,
    "previousEtaMinutes" INTEGER,
    "newEtaMinutes" INTEGER,
    "remainingDistanceKm" DOUBLE PRECISION,
    "speedKph" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrivalErrorMinutes" INTEGER,

    CONSTRAINT "EtaHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EtaHistory_shipmentId_computedAt_idx" ON "EtaHistory"("shipmentId", "computedAt");

ALTER TABLE "EtaHistory"
ADD CONSTRAINT "EtaHistory_shipmentId_fkey"
FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Telemetry stream audit rows.
CREATE TABLE "TelemetryEvent" (
    "id" SERIAL NOT NULL,
    "shipmentId" INTEGER,
    "truckId" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "eventType" TEXT,
    "state" TEXT,
    "reason" TEXT,
    "eventTimestamp" TIMESTAMP(3) NOT NULL,
    "processingState" TEXT NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelemetryEvent_truckId_eventTimestamp_idx" ON "TelemetryEvent"("truckId", "eventTimestamp");
CREATE INDEX "TelemetryEvent_shipmentId_eventTimestamp_idx" ON "TelemetryEvent"("shipmentId", "eventTimestamp");
CREATE INDEX "TelemetryEvent_processingState_createdAt_idx" ON "TelemetryEvent"("processingState", "createdAt");

ALTER TABLE "TelemetryEvent"
ADD CONSTRAINT "TelemetryEvent_shipmentId_fkey"
FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Webhook subscriptions and delivery attempts.
CREATE TABLE "WebhookSubscription" (
    "id" SERIAL NOT NULL,
    "shipperId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "signingSecretHash" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookSubscription_shipperId_enabled_idx" ON "WebhookSubscription"("shipperId", "enabled");
CREATE INDEX "WebhookSubscription_eventType_enabled_idx" ON "WebhookSubscription"("eventType", "enabled");

ALTER TABLE "WebhookSubscription"
ADD CONSTRAINT "WebhookSubscription_shipperId_fkey"
FOREIGN KEY ("shipperId") REFERENCES "Shipper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebhookAttempt" (
    "id" SERIAL NOT NULL,
    "subscriptionId" INTEGER,
    "shipmentId" INTEGER,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responsePreview" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "state" "WebhookAttemptState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookAttempt_state_nextRetryAt_idx" ON "WebhookAttempt"("state", "nextRetryAt");
CREATE INDEX "WebhookAttempt_shipmentId_createdAt_idx" ON "WebhookAttempt"("shipmentId", "createdAt");

ALTER TABLE "WebhookAttempt"
ADD CONSTRAINT "WebhookAttempt_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WebhookAttempt"
ADD CONSTRAINT "WebhookAttempt_shipmentId_fkey"
FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
