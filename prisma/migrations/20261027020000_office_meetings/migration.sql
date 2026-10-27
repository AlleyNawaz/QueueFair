ALTER TABLE "Service"
  ADD COLUMN "parentServiceId" TEXT,
  ADD COLUMN "positionTitle" TEXT,
  ADD COLUMN "officeSourceUrl" TEXT,
  ADD COLUMN "meetingRequestsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "meetingDurationMinutes" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "meetingRequestReasonOptions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Service"
  ADD CONSTRAINT "Service_parentServiceId_fkey"
    FOREIGN KEY ("parentServiceId") REFERENCES "Service"(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Service_parent_not_self_check"
    CHECK ("parentServiceId" IS NULL OR "parentServiceId" <> id),
  ADD CONSTRAINT "Service_meeting_duration_check"
    CHECK ("meetingDurationMinutes" BETWEEN 10 AND 60);

ALTER TABLE "StaffAssignment"
  ADD COLUMN "canManageDescendants" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Service_parentServiceId_idx" ON "Service"("parentServiceId");

CREATE TABLE "OfficeMeetingRequest" (
  id TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "anonymousSessionId" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  "reasonCode" TEXT NOT NULL,
  note TEXT,
  "durationMinutes" INTEGER NOT NULL DEFAULT 20,
  "preferredAt" TIMESTAMP(3),
  "scheduledAt" TIMESTAMP(3),
  "proposedAt" TIMESTAMP(3),
  "decisionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfficeMeetingRequest_pkey" PRIMARY KEY (id),
  CONSTRAINT "OfficeMeetingRequest_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfficeMeetingRequest_anonymousSessionId_fkey"
    FOREIGN KEY ("anonymousSessionId") REFERENCES "AnonymousSession"(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfficeMeetingRequest_status_check"
    CHECK (status IN ('REQUESTED', 'ACCEPTED', 'REJECTED', 'RESCHEDULE_PROPOSED', 'CANCELLED', 'COMPLETED')),
  CONSTRAINT "OfficeMeetingRequest_note_length_check"
    CHECK (note IS NULL OR char_length(note) <= 240),
  CONSTRAINT "OfficeMeetingRequest_duration_check"
    CHECK ("durationMinutes" BETWEEN 10 AND 60),
  CONSTRAINT "OfficeMeetingRequest_schedule_check"
    CHECK (
      (status = 'REQUESTED' AND "scheduledAt" IS NULL AND "proposedAt" IS NULL)
      OR (status = 'ACCEPTED' AND "scheduledAt" IS NOT NULL AND "proposedAt" IS NULL)
      OR (status = 'RESCHEDULE_PROPOSED' AND "proposedAt" IS NOT NULL)
      OR status IN ('REJECTED', 'CANCELLED', 'COMPLETED')
    )
);

CREATE UNIQUE INDEX "OfficeMeetingRequest_publicId_key"
  ON "OfficeMeetingRequest"("publicId");
CREATE INDEX "OfficeMeetingRequest_serviceId_status_createdAt_idx"
  ON "OfficeMeetingRequest"("serviceId", status, "createdAt");
CREATE INDEX "OfficeMeetingRequest_anonymousSessionId_createdAt_idx"
  ON "OfficeMeetingRequest"("anonymousSessionId", "createdAt");
CREATE INDEX "OfficeMeetingRequest_serviceId_scheduledAt_idx"
  ON "OfficeMeetingRequest"("serviceId", "scheduledAt");
CREATE UNIQUE INDEX "OfficeMeetingRequest_one_active_per_owner_office"
  ON "OfficeMeetingRequest"("anonymousSessionId", "serviceId")
  WHERE status IN ('REQUESTED', 'ACCEPTED', 'RESCHEDULE_PROPOSED');

CREATE TABLE "OfficeMeetingEvent" (
  id TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorKind" TEXT NOT NULL,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "OfficeMeetingEvent_pkey" PRIMARY KEY (id),
  CONSTRAINT "OfficeMeetingEvent_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "OfficeMeetingRequest"(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OfficeMeetingEvent_actorKind_check"
    CHECK ("actorKind" IN ('STUDENT', 'STAFF', 'SYSTEM'))
);

CREATE INDEX "OfficeMeetingEvent_requestId_createdAt_idx"
  ON "OfficeMeetingEvent"("requestId", "createdAt");
CREATE INDEX "OfficeMeetingEvent_eventType_createdAt_idx"
  ON "OfficeMeetingEvent"("eventType", "createdAt");
