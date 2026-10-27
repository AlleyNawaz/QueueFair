import type { Prisma, Service, User } from "@/generated/prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { localDate, type Hours, withinHours } from "@/lib/policy";
import { assert } from "./errors";
import { canManageMeetingOffice, meetingOfficeIds } from "./auth";
import { db } from "./db";
import { idempotent, locked } from "./queue";
import { publicState } from "./reads";

const ACTIVE = ["REQUESTED", "ACCEPTED", "RESCHEDULE_PROPOSED"];
const SCHEDULED = ["ACCEPTED", "RESCHEDULE_PROPOSED"];
const DISCLAIMER =
  "Independent QueueFair prototype. NUST’s public directory is used only as a routing reference; this is not an official NUST service and does not confirm officer availability.";
const isNustReference = (source?: string | null) =>
  !!source && /(^|\.)nust\.edu\.pk\//i.test(source);
type RequestInput = {
  reason: string;
  note?: string;
  preferredAt?: string | null;
};
type DecisionInput =
  | { action: "accept"; at: string }
  | { action: "reject"; reason: string }
  | { action: "propose"; at: string; reason?: string }
  | { action: "complete" };
type HoursService = Pick<
  Service,
  | "timezone"
  | "weeklyHours"
  | "meetingBookingHorizonDays"
  | "meetingDurationMinutes"
>;

const toDate = (value?: string | null) => (value ? new Date(value) : null);
const plusMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000);
const dateOnly = (date: Date, timezone: string) => localDate(date, timezone);

function validateSlot(
  service: HoursService,
  slot: Date,
  duration: number,
  now: Date,
) {
  assert(
    Number.isFinite(+slot) && slot > now,
    422,
    "PAST_MEETING_TIME",
    "Choose a future meeting time.",
  );
  assert(
    +slot <= +now + service.meetingBookingHorizonDays * 86400_000,
    422,
    "BOOKING_HORIZON",
    `Choose a time within the next ${service.meetingBookingHorizonDays} days.`,
  );
  const hours = service.weeklyHours as Hours;
  const end = plusMinutes(slot, duration);
  assert(
    withinHours(slot, service.timezone, hours) &&
      withinHours(new Date(+end - 60_000), service.timezone, hours) &&
      dateOnly(slot, service.timezone) ===
        dateOnly(new Date(+end - 1), service.timezone),
    422,
    "OUTSIDE_OFFICE_HOURS",
    "Choose a meeting that fits entirely within the office’s published hours.",
  );
}

async function assertSlotAvailable(
  tx: Prisma.TransactionClient,
  serviceId: string,
  slot: Date,
  duration: number,
  excludeId: string | undefined,
) {
  const end = plusMinutes(slot, duration);
  const searchFrom = plusMinutes(slot, -60);
  const candidates = await tx.officeMeetingRequest.findMany({
    where: {
      serviceId,
      status: { in: SCHEDULED },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        { scheduledAt: { gte: searchFrom, lt: end } },
        { proposedAt: { gte: searchFrom, lt: end } },
      ],
    },
    select: {
      scheduledAt: true,
      proposedAt: true,
      durationMinutes: true,
    },
  });
  const conflict = candidates.some((candidate) =>
    [candidate.scheduledAt, candidate.proposedAt]
      .filter((value): value is Date => !!value)
      .some(
        (start) =>
          +start < +end &&
          +plusMinutes(start, candidate.durationMinutes) > +slot,
      ),
  );
  assert(
    !conflict,
    409,
    "MEETING_TIME_TAKEN",
    "That time overlaps another accepted or proposed meeting. Choose another time.",
  );
}

function nextLocalDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1))
    .toISOString()
    .slice(0, 10);
}

async function assertDailyMeetingCapacity(
  tx: Prisma.TransactionClient,
  service: Service,
  slot: Date,
  excludeId?: string,
) {
  const date = localDate(slot, service.timezone);
  const start = fromZonedTime(`${date}T00:00`, service.timezone);
  const end = fromZonedTime(`${nextLocalDay(date)}T00:00`, service.timezone);
  const count = await tx.officeMeetingRequest.count({
    where: {
      serviceId: service.id,
      status: { in: SCHEDULED },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        { scheduledAt: { gte: start, lt: end } },
        { proposedAt: { gte: start, lt: end } },
      ],
    },
  });
  assert(
    count < service.meetingDailyCapacity,
    409,
    "MEETING_DAY_FULL",
    "The office has reached its meeting capacity for that local day.",
  );
}

async function meetingDay(
  tx: Prisma.TransactionClient,
  service: Service,
  date: string,
) {
  return tx.officeMeetingDay.upsert({
    where: { serviceId_localDate: { serviceId: service.id, localDate: date } },
    create: { serviceId: service.id, localDate: date, prefix: service.prefix },
    update: {},
  });
}

async function nextSequence(
  tx: Prisma.TransactionClient,
  service: Service,
  date: string,
) {
  const day = await meetingDay(tx, service, date);
  await tx.officeMeetingDay.update({
    where: { id: day.id },
    data: { nextQueueSequence: { increment: 1 } },
  });
  return { day, sequence: day.nextQueueSequence };
}

async function writeEvent(
  tx: Prisma.TransactionClient,
  requestId: string,
  type: string,
  actor: "STUDENT" | "STAFF" | "SYSTEM",
  metadata: Prisma.InputJsonObject = {},
  actorUserId?: string,
  now = new Date(),
) {
  await tx.officeMeetingEvent.create({
    data: {
      requestId,
      eventType: type,
      actorKind: actor,
      actorUserId: actor === "STAFF" ? actorUserId : null,
      metadata,
      createdAt: now,
    },
  });
}

function publicRequestRef(prefix: string, date: string, sequence: number) {
  // Review sequences restart each office-local day; date keeps references unique
  // across retained history while the random publicId remains the authority.
  return `${prefix}-M-${date.replaceAll("-", "")}-${String(sequence).padStart(3, "0")}`;
}

export async function officeDirectory(now = new Date()) {
  const offices = await db.service.findMany({
    where: { serviceType: "OFFICE" },
    orderBy: [{ directoryGroup: "desc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      location: true,
      state: true,
      pauseReason: true,
      notice: true,
      timezone: true,
      weeklyHours: true,
      parentServiceId: true,
      positionTitle: true,
      officeSourceUrl: true,
      directoryGroup: true,
      meetingRequestsEnabled: true,
      _count: { select: { counters: true } },
    },
  });
  const live = await Promise.all(
    offices.map(async (office) =>
      office.directoryGroup || office._count.counters === 0
        ? null
        : (await publicState(office.id, now)).dto,
    ),
  );
  return {
    disclaimer: offices.some((office) =>
      isNustReference(office.officeSourceUrl),
    )
      ? DISCLAIMER
      : null,
    offices: offices.map(({ _count, ...office }, index) => ({
      ...office,
      weeklyHours: office.weeklyHours as Hours,
      configuredCounters: _count.counters,
      waitingCount: live[index]?.waitingCount ?? 0,
      joiningOpen: live[index]?.joiningOpen ?? false,
      estimateLabel: live[index]?.estimate.label ?? "Estimate unavailable",
    })),
  };
}

export async function officeDetail(slug: string) {
  const office = await db.service.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      location: true,
      state: true,
      pauseReason: true,
      notice: true,
      timezone: true,
      weeklyHours: true,
      parentServiceId: true,
      positionTitle: true,
      officeSourceUrl: true,
      directoryGroup: true,
      serviceType: true,
      meetingRequestsEnabled: true,
      meetingDurationMinutes: true,
      meetingBookingHorizonDays: true,
      meetingCancellationCutoffMinutes: true,
      meetingDailyCapacity: true,
      meetingRequestReasonOptions: true,
      allowNote: true,
      visitReasonOptions: true,
      documentRequirements: true,
      _count: { select: { counters: true } },
    },
  });
  assert(
    office?.serviceType === "OFFICE",
    404,
    "NOT_FOUND",
    "Office not found.",
  );
  const parent = office.parentServiceId
    ? await db.service.findUnique({
        where: { id: office.parentServiceId },
        select: {
          id: true,
          slug: true,
          name: true,
          positionTitle: true,
          officeSourceUrl: true,
        },
      })
    : null;
  const children = await db.service.findMany({
    where: { parentServiceId: office.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      positionTitle: true,
      directoryGroup: true,
    },
  });
  const live =
    office.directoryGroup || office._count.counters === 0
      ? null
      : (await publicState(office.id)).dto;
  const { _count, ...officeData } = office;
  return {
    disclaimer: isNustReference(office.officeSourceUrl) ? DISCLAIMER : null,
    office: {
      ...officeData,
      weeklyHours: office.weeklyHours as Hours,
      parent,
      children,
      configuredCounters: _count.counters,
      waitingCount: live?.waitingCount ?? 0,
      joiningOpen: live?.joiningOpen ?? false,
      estimateLabel: live?.estimate.label ?? "Estimate unavailable",
    },
  };
}

export async function createMeetingRequest(
  serviceId: string,
  ownerId: string,
  input: RequestInput,
  key: string,
  now = new Date(),
) {
  return locked(serviceId, async (tx, service) =>
    idempotent(
      tx,
      ownerId,
      `meeting-create:${serviceId}`,
      key,
      input,
      async () => {
        assert(
          service.serviceType === "OFFICE" &&
            service.meetingRequestsEnabled &&
            !service.directoryGroup,
          409,
          "MEETING_REQUESTS_DISABLED",
          "This office is not currently accepting meeting requests.",
        );
        assert(
          service.meetingRequestReasonOptions.includes(input.reason),
          422,
          "INVALID_REASON",
          "Choose one of the listed meeting topics.",
        );
        assert(
          service.allowNote || !input.note,
          422,
          "NOTE_DISABLED",
          "This office does not accept a private note.",
        );
        const date = localDate(now, service.timezone);
        const active = await tx.officeMeetingRequest.findFirst({
          where: {
            serviceId,
            anonymousSessionId: ownerId,
            status: { in: ACTIVE },
          },
          select: { publicId: true },
        });
        if (active) return { publicId: active.publicId, existing: true };
        const today = await meetingDay(tx, service, date);
        const currentCount = await tx.officeMeetingRequest.count({
          where: { officeDayId: today.id, status: { in: ACTIVE } },
        });
        assert(
          currentCount < service.maxWaitingTickets,
          409,
          "MEETING_REVIEW_FULL",
          "This office has reached its current request capacity. Please try again later.",
        );
        const preferredAt = toDate(input.preferredAt);
        if (preferredAt)
          validateSlot(
            service,
            preferredAt,
            service.meetingDurationMinutes,
            now,
          );
        const { day, sequence } = await nextSequence(tx, service, date);
        const request = await tx.officeMeetingRequest.create({
          data: {
            serviceId,
            anonymousSessionId: ownerId,
            officeDayId: day.id,
            reviewDate: date,
            queueSequence: sequence,
            publicReference: publicRequestRef(day.prefix, date, sequence),
            reasonCode: input.reason,
            note: service.allowNote ? input.note || null : null,
            durationMinutes: service.meetingDurationMinutes,
            preferredAt,
            status: "REQUESTED",
            createdAt: now,
            updatedAt: now,
          },
        });
        await writeEvent(
          tx,
          request.id,
          "REQUESTED",
          "STUDENT",
          {
            queueSequence: sequence,
            preferredAt: preferredAt?.toISOString() ?? null,
          },
          undefined,
          now,
        );
        return { publicId: request.publicId, existing: false };
      },
    ),
  );
}

async function ownerRequest(publicId: string, ownerId: string) {
  const request = await db.officeMeetingRequest.findFirst({
    where: { publicId, anonymousSessionId: ownerId },
    include: { officeDay: true },
  });
  assert(
    request,
    404,
    "NOT_FOUND",
    "Meeting request not found in this browser.",
  );
  return request;
}

function studentRequestDto(request: {
  publicId: string;
  publicReference: string | null;
  serviceId: string;
  anonymousSessionId: string;
  status: string;
  reasonCode: string;
  note: string | null;
  durationMinutes: number;
  preferredAt: Date | null;
  scheduledAt: Date | null;
  proposedAt: Date | null;
  decisionReason: string | null;
  reviewDate: string | null;
  queueSequence: number | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  service: {
    name: string;
    slug: string;
    location: string;
    timezone: string;
    officeSourceUrl: string | null;
    meetingCancellationCutoffMinutes: number;
  };
  events: {
    eventType: string;
    actorKind: string;
    createdAt: Date;
    metadata: Prisma.JsonValue;
  }[];
  ahead: number;
  now: Date;
}) {
  const cutoff = request.scheduledAt
    ? +request.scheduledAt -
      request.service.meetingCancellationCutoffMinutes * 60_000
    : Infinity;
  return {
    publicId: request.publicId,
    reference: request.publicReference,
    status: request.status,
    reason: request.reasonCode,
    note: request.note,
    durationMinutes: request.durationMinutes,
    preferredAt: request.preferredAt?.toISOString() ?? null,
    scheduledAt: request.scheduledAt?.toISOString() ?? null,
    proposedAt: request.proposedAt?.toISOString() ?? null,
    decisionReason: request.decisionReason,
    submittedAt: request.createdAt.toISOString(),
    completedAt: request.completedAt?.toISOString() ?? null,
    cancelledAt: request.cancelledAt?.toISOString() ?? null,
    reviewDate: request.reviewDate,
    reviewPosition: request.status === "REQUESTED" ? request.ahead + 1 : null,
    reviewAhead: request.status === "REQUESTED" ? request.ahead : null,
    canCancel: ACTIVE.includes(request.status) && +request.now < cutoff,
    cancellationDeadline: Number.isFinite(cutoff)
      ? new Date(cutoff).toISOString()
      : null,
    office: request.service,
    events: request.events.map((event) => ({
      type: event.eventType,
      actor: event.actorKind,
      at: event.createdAt.toISOString(),
      metadata: event.metadata,
    })),
    officeDisclaimer: isNustReference(request.service.officeSourceUrl)
      ? DISCLAIMER
      : null,
    syncedAt: request.now.toISOString(),
  };
}

async function requestWithEvents(publicId: string, ownerId: string, now: Date) {
  const request = await db.officeMeetingRequest.findFirst({
    where: { publicId, anonymousSessionId: ownerId },
    include: {
      officeDay: true,
      service: {
        select: {
          name: true,
          slug: true,
          location: true,
          timezone: true,
          officeSourceUrl: true,
          meetingCancellationCutoffMinutes: true,
        },
      },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  assert(
    request,
    404,
    "NOT_FOUND",
    "Meeting request not found in this browser.",
  );
  const ahead =
    request.status === "REQUESTED" &&
    request.officeDayId &&
    request.queueSequence
      ? await db.officeMeetingRequest.count({
          where: {
            officeDayId: request.officeDayId,
            status: "REQUESTED",
            queueSequence: { lt: request.queueSequence },
          },
        })
      : 0;
  return studentRequestDto({ ...request, ahead, now });
}

export async function meetingRequestDetail(
  publicId: string,
  ownerId: string,
  now = new Date(),
) {
  return requestWithEvents(publicId, ownerId, now);
}

export async function myMeetingRequests(ownerId: string) {
  const list = await db.officeMeetingRequest.findMany({
    where: { anonymousSessionId: ownerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { publicId: true },
  });
  return Promise.all(
    list.map((request) =>
      requestWithEvents(request.publicId, ownerId, new Date()),
    ),
  );
}

export async function officeInbox(
  user: User,
  officeId?: string,
  status?: string,
) {
  assert(
    !status ||
      [
        "REQUESTED",
        "ACCEPTED",
        "REJECTED",
        "RESCHEDULE_PROPOSED",
        "CANCELLED",
        "COMPLETED",
      ].includes(status),
    422,
    "INVALID_STATUS",
    "Choose a valid meeting request status.",
  );
  const permitted = await meetingOfficeIds(user);
  const offices = await db.service.findMany({
    where: { id: { in: permitted } },
    select: {
      id: true,
      name: true,
      slug: true,
      location: true,
      positionTitle: true,
      officeSourceUrl: true,
      parentServiceId: true,
      timezone: true,
      meetingCancellationCutoffMinutes: true,
    },
    orderBy: { name: "asc" },
  });
  if (officeId)
    assert(
      permitted.includes(officeId),
      403,
      "FORBIDDEN",
      "You are not assigned to this office inbox.",
    );
  const selected = officeId
    ? offices.filter((office) => office.id === officeId)
    : offices;
  const requests = await db.officeMeetingRequest.findMany({
    where: {
      serviceId: { in: selected.map((office) => office.id) },
      ...(status ? { status } : {}),
    },
    include: {
      officeDay: true,
      service: {
        select: {
          id: true,
          name: true,
          slug: true,
          location: true,
          timezone: true,
        },
      },
      events: { orderBy: { createdAt: "asc" } },
    },
    orderBy: [
      { status: "asc" },
      { queueSequence: "asc" },
      { scheduledAt: "asc" },
      { createdAt: "asc" },
    ],
    take: 200,
  });
  const counts = await Promise.all(
    requests.map(async (request) => ({
      id: request.id,
      reference: request.publicReference,
      office: request.service,
      status: request.status,
      reason: request.reasonCode,
      note: request.note,
      preferredAt: request.preferredAt?.toISOString() ?? null,
      scheduledAt: request.scheduledAt?.toISOString() ?? null,
      proposedAt: request.proposedAt?.toISOString() ?? null,
      decisionReason: request.decisionReason,
      durationMinutes: request.durationMinutes,
      reviewDate: request.reviewDate,
      queueSequence: request.queueSequence,
      reviewPosition:
        request.status === "REQUESTED" &&
        request.officeDayId &&
        request.queueSequence
          ? 1 +
            (await db.officeMeetingRequest.count({
              where: {
                officeDayId: request.officeDayId,
                status: "REQUESTED",
                queueSequence: { lt: request.queueSequence },
              },
            }))
          : null,
      submittedAt: request.createdAt.toISOString(),
      events: request.events.map((event) => ({
        type: event.eventType,
        at: event.createdAt.toISOString(),
        metadata: event.metadata,
      })),
    })),
  );
  return {
    disclaimer: selected.some((office) =>
      isNustReference(office.officeSourceUrl),
    )
      ? DISCLAIMER
      : null,
    offices,
    requests: counts,
    groups: {
      review: counts
        .filter((request) => request.status === "REQUESTED")
        .sort((a, b) => (a.queueSequence ?? 0) - (b.queueSequence ?? 0)),
      awaitingStudent: counts.filter(
        (request) => request.status === "RESCHEDULE_PROPOSED",
      ),
      upcoming: counts
        .filter((request) => request.status === "ACCEPTED")
        .sort(
          (a, b) =>
            new Date(a.scheduledAt ?? 0).getTime() -
            new Date(b.scheduledAt ?? 0).getTime(),
        ),
      closed: counts.filter((request) =>
        ["REJECTED", "CANCELLED", "COMPLETED"].includes(request.status),
      ),
    },
    syncedAt: new Date().toISOString(),
  };
}

async function getRequestForStaff(tx: Prisma.TransactionClient, id: string) {
  const request = await tx.officeMeetingRequest.findUnique({ where: { id } });
  assert(request, 404, "NOT_FOUND", "Meeting request not found.");
  return request;
}

export async function staffMeetingDecision(
  id: string,
  user: User,
  input: DecisionInput,
  key: string,
  now = new Date(),
) {
  const lookup = await db.officeMeetingRequest.findUnique({
    where: { id },
    select: { serviceId: true },
  });
  assert(lookup, 404, "NOT_FOUND", "Meeting request not found.");
  assert(
    await canManageMeetingOffice(user, lookup.serviceId),
    404,
    "NOT_FOUND",
    "Meeting request not found.",
  );
  return locked(lookup.serviceId, async (tx, service) =>
    idempotent(
      tx,
      user.id,
      `meeting-decision:${id}:${input.action}`,
      key,
      input,
      async () => {
        const request = await getRequestForStaff(tx, id);
        assert(
          service.meetingRequestsEnabled,
          409,
          "MEETING_REQUESTS_DISABLED",
          "This office has disabled meeting requests.",
        );
        if (input.action === "accept") {
          assert(
            request.status === "REQUESTED",
            409,
            "INVALID_MEETING_TRANSITION",
            "Only a request awaiting review can be accepted.",
          );
          const at = new Date(input.at);
          validateSlot(service, at, request.durationMinutes, now);
          await assertDailyMeetingCapacity(tx, service, at, request.id);
          await assertSlotAvailable(
            tx,
            service.id,
            at,
            request.durationMinutes,
            request.id,
          );
          await tx.officeMeetingRequest.update({
            where: { id },
            data: {
              status: "ACCEPTED",
              scheduledAt: at,
              proposedAt: null,
              decisionReason: null,
              updatedAt: now,
            },
          });
          await writeEvent(
            tx,
            id,
            "ACCEPTED",
            "STAFF",
            {
              scheduledAt: at.toISOString(),
              durationMinutes: request.durationMinutes,
            },
            user.id,
            now,
          );
        } else if (input.action === "reject") {
          assert(
            request.status === "REQUESTED",
            409,
            "INVALID_MEETING_TRANSITION",
            "Only a request awaiting review can be rejected.",
          );
          await tx.officeMeetingRequest.update({
            where: { id },
            data: {
              status: "REJECTED",
              decisionReason: input.reason,
              updatedAt: now,
            },
          });
          await writeEvent(
            tx,
            id,
            "REJECTED",
            "STAFF",
            { reason: input.reason },
            user.id,
            now,
          );
        } else if (input.action === "propose") {
          assert(
            request.status === "REQUESTED" || request.status === "ACCEPTED",
            409,
            "INVALID_MEETING_TRANSITION",
            "This request cannot be rescheduled in its current state.",
          );
          const at = new Date(input.at);
          validateSlot(service, at, request.durationMinutes, now);
          await assertDailyMeetingCapacity(tx, service, at, request.id);
          await assertSlotAvailable(
            tx,
            service.id,
            at,
            request.durationMinutes,
            request.id,
          );
          await tx.officeMeetingRequest.update({
            where: { id },
            data: {
              status: "RESCHEDULE_PROPOSED",
              proposedAt: at,
              decisionReason: input.reason ?? null,
              updatedAt: now,
            },
          });
          await writeEvent(
            tx,
            id,
            "RESCHEDULE_PROPOSED",
            "STAFF",
            {
              previousAt: request.scheduledAt?.toISOString() ?? null,
              proposedAt: at.toISOString(),
              reason: input.reason ?? null,
            },
            user.id,
            now,
          );
        } else {
          assert(
            request.status === "ACCEPTED",
            409,
            "INVALID_MEETING_TRANSITION",
            "Only an accepted meeting can be completed.",
          );
          assert(
            request.scheduledAt && +request.scheduledAt <= +now,
            409,
            "MEETING_NOT_DUE",
            "This meeting cannot be completed before its accepted time.",
          );
          await tx.officeMeetingRequest.update({
            where: { id },
            data: { status: "COMPLETED", completedAt: now, updatedAt: now },
          });
          await writeEvent(
            tx,
            id,
            "COMPLETED",
            "STAFF",
            { scheduledAt: request.scheduledAt.toISOString() },
            user.id,
            now,
          );
        }
        return {
          id,
          status:
            input.action === "propose"
              ? "RESCHEDULE_PROPOSED"
              : input.action === "complete"
                ? "COMPLETED"
                : input.action === "reject"
                  ? "REJECTED"
                  : "ACCEPTED",
        };
      },
    ),
  );
}

export async function studentMeetingCommand(
  publicId: string,
  ownerId: string,
  action: "cancel" | "accept-proposal" | "decline-proposal",
  key: string,
  now = new Date(),
) {
  const lookup = await ownerRequest(publicId, ownerId);
  return locked(lookup.serviceId, async (tx, service) =>
    idempotent(
      tx,
      ownerId,
      `meeting-student:${lookup.id}:${action}`,
      key,
      { action },
      async () => {
        const request = await tx.officeMeetingRequest.findFirst({
          where: { id: lookup.id, anonymousSessionId: ownerId },
        });
        assert(
          request,
          404,
          "NOT_FOUND",
          "Meeting request not found in this browser.",
        );
        if (action === "cancel") {
          assert(
            ACTIVE.includes(request.status),
            409,
            "INVALID_MEETING_TRANSITION",
            "This request is already closed.",
          );
          if (
            request.status === "ACCEPTED" ||
            (request.status === "RESCHEDULE_PROPOSED" && request.scheduledAt)
          ) {
            const cutoff =
              +request.scheduledAt! -
              service.meetingCancellationCutoffMinutes * 60_000;
            assert(
              +now <= cutoff,
              409,
              "CONTACT_OFFICE",
              "The cancellation window has passed. Please contact the office directly.",
            );
          }
          await tx.officeMeetingRequest.update({
            where: { id: request.id },
            data: {
              status: "CANCELLED",
              proposedAt: null,
              cancelledAt: now,
              updatedAt: now,
            },
          });
          await writeEvent(
            tx,
            request.id,
            "CANCELLED",
            "STUDENT",
            {},
            undefined,
            now,
          );
        } else {
          assert(
            request.status === "RESCHEDULE_PROPOSED" && request.proposedAt,
            409,
            "INVALID_MEETING_TRANSITION",
            "There is no proposed time awaiting your response.",
          );
          if (action === "accept-proposal") {
            validateSlot(
              service,
              request.proposedAt,
              request.durationMinutes,
              now,
            );
            await assertDailyMeetingCapacity(
              tx,
              service,
              request.proposedAt,
              request.id,
            );
            await assertSlotAvailable(
              tx,
              service.id,
              request.proposedAt,
              request.durationMinutes,
              request.id,
            );
            await tx.officeMeetingRequest.update({
              where: { id: request.id },
              data: {
                status: "ACCEPTED",
                scheduledAt: request.proposedAt,
                proposedAt: null,
                decisionReason: null,
                updatedAt: now,
              },
            });
            await writeEvent(
              tx,
              request.id,
              "PROPOSAL_ACCEPTED",
              "STUDENT",
              { scheduledAt: request.proposedAt.toISOString() },
              undefined,
              now,
            );
          } else if (request.scheduledAt) {
            await tx.officeMeetingRequest.update({
              where: { id: request.id },
              data: {
                status: "ACCEPTED",
                proposedAt: null,
                decisionReason: null,
                updatedAt: now,
              },
            });
            await writeEvent(
              tx,
              request.id,
              "PROPOSAL_DECLINED_KEPT_ACCEPTED_TIME",
              "STUDENT",
              { scheduledAt: request.scheduledAt.toISOString() },
              undefined,
              now,
            );
          } else {
            const date = localDate(now, service.timezone);
            const { day, sequence } = await nextSequence(tx, service, date);
            await tx.officeMeetingRequest.update({
              where: { id: request.id },
              data: {
                status: "REQUESTED",
                officeDayId: day.id,
                reviewDate: date,
                queueSequence: sequence,
                proposedAt: null,
                decisionReason: null,
                updatedAt: now,
              },
            });
            await writeEvent(
              tx,
              request.id,
              "PROPOSAL_DECLINED_REQUEUED",
              "STUDENT",
              { queueSequence: sequence, reviewDate: date },
              undefined,
              now,
            );
          }
        }
        return { publicId: request.publicId, action };
      },
    ),
  );
}
