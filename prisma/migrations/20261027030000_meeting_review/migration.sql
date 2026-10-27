ALTER TABLE "Service"
  ADD COLUMN "meetingBookingHorizonDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "meetingCancellationCutoffMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "meetingDailyCapacity" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "directoryGroup" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Service"
  ADD CONSTRAINT "Service_meeting_horizon_check"
    CHECK ("meetingBookingHorizonDays" BETWEEN 1 AND 180),
  ADD CONSTRAINT "Service_meeting_cutoff_check"
    CHECK ("meetingCancellationCutoffMinutes" BETWEEN 0 AND 10080),
  ADD CONSTRAINT "Service_meeting_capacity_check"
    CHECK ("meetingDailyCapacity" BETWEEN 1 AND 100);

CREATE TABLE "OfficeMeetingDay" (
  id TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "localDate" TEXT NOT NULL,
  prefix TEXT NOT NULL,
  "nextQueueSequence" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "OfficeMeetingDay_pkey" PRIMARY KEY (id),
  CONSTRAINT "OfficeMeetingDay_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfficeMeetingDay_nextQueueSequence_check"
    CHECK ("nextQueueSequence" > 0)
);

CREATE UNIQUE INDEX "OfficeMeetingDay_serviceId_localDate_key"
  ON "OfficeMeetingDay"("serviceId", "localDate");

ALTER TABLE "OfficeMeetingRequest"
  ADD COLUMN "officeDayId" TEXT,
  ADD COLUMN "reviewDate" TEXT,
  ADD COLUMN "queueSequence" INTEGER,
  ADD COLUMN "publicReference" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

CREATE INDEX "OfficeMeetingRequest_officeDayId_queueSequence_idx"
  ON "OfficeMeetingRequest"("officeDayId", "queueSequence");
CREATE INDEX "OfficeMeetingRequest_serviceId_proposedAt_idx"
  ON "OfficeMeetingRequest"("serviceId", "proposedAt");
CREATE UNIQUE INDEX "OfficeMeetingRequest_publicReference_key"
  ON "OfficeMeetingRequest"("publicReference")
  WHERE "publicReference" IS NOT NULL;
CREATE UNIQUE INDEX "OfficeMeetingRequest_officeDayId_queueSequence_key"
  ON "OfficeMeetingRequest"("officeDayId", "queueSequence")
  WHERE "officeDayId" IS NOT NULL AND "queueSequence" IS NOT NULL;

ALTER TABLE "OfficeMeetingRequest"
  ADD CONSTRAINT "OfficeMeetingRequest_officeDayId_fkey"
    FOREIGN KEY ("officeDayId") REFERENCES "OfficeMeetingDay"(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
