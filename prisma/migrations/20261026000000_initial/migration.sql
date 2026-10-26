-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "hashedToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("hashedToken")
);

-- CreateTable
CREATE TABLE "AnonymousSession" (
    "id" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonymousSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "pauseReason" TEXT,
    "notice" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi',
    "weeklyHours" JSONB NOT NULL,
    "defaultServiceSeconds" INTEGER NOT NULL DEFAULT 360,
    "gracePeriodSeconds" INTEGER NOT NULL DEFAULT 120,
    "maxWaitingTickets" INTEGER NOT NULL DEFAULT 100,
    "documentRequirements" TEXT[],
    "visitReasonOptions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OFFLINE',
    "pauseReason" TEXT,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "counterId" TEXT,

    CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceDay" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextTokenSequence" INTEGER NOT NULL DEFAULT 1,
    "nextQueueSequence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ServiceDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "serviceDayId" TEXT NOT NULL,
    "anonymousSessionId" TEXT NOT NULL,
    "tokenSequence" INTEGER NOT NULL,
    "tokenLabel" TEXT NOT NULL,
    "queueSequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "visitReasonCode" TEXT NOT NULL,
    "note" TEXT,
    "assignedCounterId" TEXT,
    "rejoinCount" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queueEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "serviceStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "missedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceEvent" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "counterId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ServiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveParticipation" (
    "id" TEXT NOT NULL,
    "anonymousSessionId" TEXT NOT NULL,
    "serviceDayId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,

    CONSTRAINT "ActiveParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnonymousSession_hashedSecret_key" ON "AnonymousSession"("hashedSecret");

-- CreateIndex
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_serviceId_name_key" ON "Counter"("serviceId", "name");

-- CreateIndex
CREATE INDEX "StaffAssignment_userId_serviceId_idx" ON "StaffAssignment"("userId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceDay_serviceId_localDate_key" ON "ServiceDay"("serviceId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_publicId_key" ON "Ticket"("publicId");

-- CreateIndex
CREATE INDEX "Ticket_serviceDayId_status_queueSequence_idx" ON "Ticket"("serviceDayId", "status", "queueSequence");

-- CreateIndex
CREATE INDEX "Ticket_assignedCounterId_status_idx" ON "Ticket"("assignedCounterId", "status");

-- CreateIndex
CREATE INDEX "Ticket_anonymousSessionId_idx" ON "Ticket"("anonymousSessionId");

-- CreateIndex
CREATE INDEX "Ticket_completedAt_idx" ON "Ticket"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_serviceDayId_tokenSequence_key" ON "Ticket"("serviceDayId", "tokenSequence");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_serviceDayId_queueSequence_key" ON "Ticket"("serviceDayId", "queueSequence");

-- CreateIndex
CREATE INDEX "TicketEvent_ticketId_createdAt_idx" ON "TicketEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketEvent_eventType_createdAt_idx" ON "TicketEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceEvent_serviceId_createdAt_idx" ON "ServiceEvent"("serviceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveParticipation_ticketId_key" ON "ActiveParticipation"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveParticipation_anonymousSessionId_serviceDayId_key" ON "ActiveParticipation"("anonymousSessionId", "serviceDayId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_actor_operation_key_key" ON "IdempotencyRecord"("actor", "operation", "key");

-- CreateIndex
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDay" ADD CONSTRAINT "ServiceDay_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_serviceDayId_fkey" FOREIGN KEY ("serviceDayId") REFERENCES "ServiceDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_anonymousSessionId_fkey" FOREIGN KEY ("anonymousSessionId") REFERENCES "AnonymousSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedCounterId_fkey" FOREIGN KEY ("assignedCounterId") REFERENCES "Counter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveParticipation" ADD CONSTRAINT "ActiveParticipation_anonymousSessionId_fkey" FOREIGN KEY ("anonymousSessionId") REFERENCES "AnonymousSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveParticipation" ADD CONSTRAINT "ActiveParticipation_serviceDayId_fkey" FOREIGN KEY ("serviceDayId") REFERENCES "ServiceDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveParticipation" ADD CONSTRAINT "ActiveParticipation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A counter can hold at most one called or serving ticket, even outside application code.
CREATE UNIQUE INDEX "Ticket_one_active_per_counter" ON "Ticket" ("assignedCounterId") WHERE status IN ('CALLED','SERVING');
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_status_check" CHECK (status IN ('WAITING','CALLED','SERVING','COMPLETED','MISSED','CANCELLED','EXPIRED'));
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_active_assignment_check" CHECK (status NOT IN ('CALLED','SERVING') OR "assignedCounterId" IS NOT NULL);
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_sequences_check" CHECK ("tokenSequence" > 0 AND "queueSequence" > 0 AND "rejoinCount" BETWEEN 0 AND 1);
ALTER TABLE "Service" ADD CONSTRAINT "Service_state_check" CHECK (state IN ('OPEN','PAUSED','CLOSED'));
ALTER TABLE "Service" ADD CONSTRAINT "Service_limits_check" CHECK ("defaultServiceSeconds" BETWEEN 30 AND 7200 AND "gracePeriodSeconds" BETWEEN 10 AND 600 AND "maxWaitingTickets" BETWEEN 1 AND 1000);
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_state_check" CHECK (state IN ('ACTIVE','PAUSED','OFFLINE'));
ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK (role IN ('STAFF','ADMIN'));
