ALTER TABLE "Service"
  ADD COLUMN "serviceType" TEXT NOT NULL DEFAULT 'DESK',
  ADD COLUMN "allowNote" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Service"
  ADD CONSTRAINT "Service_serviceType_check"
  CHECK ("serviceType" IN ('DESK', 'OFFICE'));
