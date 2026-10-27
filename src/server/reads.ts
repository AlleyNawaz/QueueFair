import { db } from "./db";
import { estimateWait, localDate, type Hours } from "@/lib/policy";
import { openNow } from "./queue";
import { assert } from "./errors";
import type { User } from "@/generated/prisma/client";
import { visibleServiceScopes } from "./auth";
export async function publicState(serviceId: string, now = new Date()) {
  const s = await db.service.findUnique({
    where: { id: serviceId },
    include: { counters: { orderBy: { name: "asc" } } },
  });
  assert(s, 404, "NOT_FOUND", "Service not found.");
  const today = localDate(now, s.timezone);
  const tickets = await db.ticket.findMany({
    where: {
      serviceDay: { serviceId, localDate: today },
      status: { in: ["WAITING", "CALLED", "SERVING"] },
    },
    orderBy: { queueSequence: "asc" },
    select: {
      id: true,
      tokenLabel: true,
      status: true,
      queueSequence: true,
      assignedCounterId: true,
      calledAt: true,
      serviceStartedAt: true,
    },
  });
  // Active old-day work remains visible and blocks its counter until staff resolve it.
  const activeWork = await db.ticket.findMany({
    where: {
      assignedCounter: { serviceId },
      status: { in: ["CALLED", "SERVING"] },
    },
    select: {
      tokenLabel: true,
      status: true,
      assignedCounterId: true,
      calledAt: true,
      serviceStartedAt: true,
    },
  });
  const recent = await db.$queryRaw<{ seconds: number }[]>`
    SELECT EXTRACT(EPOCH FROM (t."completedAt" - t."serviceStartedAt"))::double precision AS seconds
    FROM "Ticket" t JOIN "ServiceDay" d ON t."serviceDayId" = d.id
    WHERE d."serviceId" = ${serviceId} AND t.status = 'COMPLETED'
      AND t."completedAt" - t."serviceStartedAt" BETWEEN INTERVAL '30 seconds' AND INTERVAL '2 hours'
    ORDER BY t."completedAt" DESC LIMIT 30`;
  const durations = recent.map((t) => t.seconds);
  const waiting = tickets.filter((t) => t.status === "WAITING");
  const counterInputs = s.counters.map((c) => ({
    state: c.state,
    work: activeWork.find((t) => t.assignedCounterId === c.id),
  }));
  const estimate = (ahead: number) =>
    estimateWait({
      now,
      open: openNow(s, now),
      baseline: s.defaultServiceSeconds,
      grace: s.gracePeriodSeconds,
      durations,
      counters: counterInputs,
      ahead,
    });
  return {
    dto: {
      id: s.id,
      slug: s.slug,
      serviceType: s.serviceType,
      allowNote: s.allowNote,
      directoryGroup: s.directoryGroup,
      parentServiceId: s.parentServiceId,
      positionTitle: s.positionTitle,
      officeSourceUrl: s.officeSourceUrl,
      meetingRequestsEnabled: s.meetingRequestsEnabled,
      name: s.name,
      description: s.description,
      prefix: s.prefix,
      location: s.location,
      state: s.state,
      pauseReason: s.pauseReason,
      notice: s.notice,
      timezone: s.timezone,
      weeklyHours: s.weeklyHours as Hours,
      documentRequirements: s.documentRequirements,
      visitReasonOptions: s.visitReasonOptions,
      gracePeriodSeconds: s.gracePeriodSeconds,
      maxWaitingTickets: s.maxWaitingTickets,
      joiningOpen: openNow(s, now),
      waitingCount: waiting.length,
      estimate: estimate(waiting.length),
      counters: s.counters.map((c) => ({
        id: c.id,
        name: c.name,
        state: c.state,
        pauseReason: c.pauseReason,
        current:
          activeWork
            .filter((t) => t.assignedCounterId === c.id)
            .map((t) => ({ tokenLabel: t.tokenLabel, status: t.status }))[0] ??
          null,
      })),
      next: waiting.slice(0, 5).map((t) => ({ tokenLabel: t.tokenLabel })),
      localDate: today,
      syncedAt: now.toISOString(),
      demo: process.env.DEMO_MODE === "true",
    },
    waiting,
    estimate,
  };
}
export async function services() {
  const list = await db.service.findMany({
    select: { id: true },
    orderBy: { name: "asc" },
  });
  return Promise.all(list.map(async (s) => (await publicState(s.id)).dto));
}
export async function privateTicket(publicId: string, ownerId: string) {
  const t = await db.ticket.findFirst({
    where: { publicId, anonymousSessionId: ownerId },
    include: {
      serviceDay: true,
      assignedCounter: true,
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  assert(t, 404, "NOT_FOUND", "Ticket not found in this browser.");
  const state = await publicState(t.serviceDay.serviceId);
  const ahead = state.waiting.filter(
    (w) => w.queueSequence < t.queueSequence,
  ).length;
  return {
    publicId: t.publicId,
    tokenLabel: t.tokenLabel,
    status: t.status,
    visitReasonCode: t.visitReasonCode,
    note: t.note,
    localDate: t.serviceDay.localDate,
    joinedAt: t.joinedAt.toISOString(),
    calledAt: t.calledAt?.toISOString() ?? null,
    rejoinCount: t.rejoinCount,
    canRejoin:
      t.status === "MISSED" &&
      t.rejoinCount === 0 &&
      t.serviceDay.localDate === state.dto.localDate &&
      state.dto.joiningOpen,
    counter: t.assignedCounter ? { name: t.assignedCounter.name } : null,
    service: state.dto,
    ahead,
    estimate: state.estimate(ahead),
    events: t.events.map((e) => ({
      id: e.id,
      type: e.eventType,
      at: e.createdAt.toISOString(),
      metadata: e.metadata,
    })),
    syncedAt: state.dto.syncedAt,
  };
}
export async function myTickets(ownerId: string) {
  const list = await db.ticket.findMany({
    where: { anonymousSessionId: ownerId },
    orderBy: { joinedAt: "desc" },
    take: 50,
    select: { publicId: true },
  });
  return Promise.all(list.map((t) => privateTicket(t.publicId, ownerId)));
}
export async function staffOverview(user: User) {
  const scopes = await visibleServiceScopes(user);
  const scopeByService = new Map(
    scopes.map((scope) => [scope.serviceId, scope]),
  );
  const list = await db.service.findMany({
    where: { id: { in: scopes.map((scope) => scope.serviceId) } },
    orderBy: { name: "asc" },
  });
  const items = await Promise.all(
    list.map(async (s) => {
      const state = (await publicState(s.id)).dto;
      const all = await db.ticket.findMany({
        where: {
          serviceDay: { serviceId: s.id },
          OR: [
            { status: { in: ["CALLED", "SERVING"] } },
            { status: "WAITING", serviceDay: { localDate: state.localDate } },
          ],
        },
        orderBy: { queueSequence: "asc" },
        select: {
          id: true,
          tokenLabel: true,
          status: true,
          visitReasonCode: true,
          note: true,
          assignedCounterId: true,
          queueEnteredAt: true,
          calledAt: true,
          serviceStartedAt: true,
          rejoinCount: true,
        },
      });
      return {
        ...state,
        counters: state.counters
          .filter((c) => {
            const scope = scopeByService.get(s.id);
            return (
              scope?.wholeService || scope?.counterIds.includes(c.id) || false
            );
          })
          .map((c) => {
            const work = all.find(
              (t) =>
                t.assignedCounterId === c.id &&
                ["CALLED", "SERVING"].includes(t.status),
            );
            const assignedStaff =
              user.role === "STAFF" &&
              scopeByService.get(s.id)?.visible === true;
            return {
              ...c,
              work: work
                ? {
                    ...work,
                    visitReasonCode: assignedStaff
                      ? work.visitReasonCode
                      : null,
                    note: assignedStaff ? work.note : null,
                  }
                : null,
            };
          }),
        waiting: all
          .filter((t) => t.status === "WAITING")
          .map((t) => ({
            id: t.id,
            tokenLabel: t.tokenLabel,
            rejoinCount: t.rejoinCount,
            queueEnteredAt: t.queueEnteredAt,
            visitReasonCode:
              user.role === "STAFF" &&
              scopeByService.get(s.id)?.visible === true
                ? t.visitReasonCode
                : null,
            note:
              user.role === "STAFF" &&
              scopeByService.get(s.id)?.visible === true
                ? t.note
                : null,
          })),
      };
    }),
  );
  return {
    user: { displayName: user.displayName, role: user.role },
    services: items,
    syncedAt: new Date().toISOString(),
  };
}
export async function analytics(from: Date, to: Date) {
  const completed = await db.ticket.findMany({
    where: { completedAt: { gte: from, lt: to } },
    select: { serviceStartedAt: true, completedAt: true },
  });
  const events = await db.ticketEvent.findMany({
    where: {
      createdAt: { gte: from, lt: to },
      eventType: { in: ["CALLED", "MISSED", "REJOINED"] },
    },
    select: { eventType: true, metadata: true },
  });
  const waits = events
    .filter((e) => e.eventType === "CALLED")
    .map((e) => Number((e.metadata as { waitSeconds?: number }).waitSeconds))
    .filter(Number.isFinite);
  const durations = completed
    .filter((t) => t.serviceStartedAt && t.completedAt)
    .map((t) => (+t.completedAt! - +t.serviceStartedAt!) / 1000);
  const mean = (ns: number[]) =>
    ns.length ? Math.round(ns.reduce((a, b) => a + b, 0) / ns.length) : null;
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    completed: completed.length,
    missed: events.filter((e) => e.eventType === "MISSED").length,
    rejoins: events.filter((e) => e.eventType === "REJOINED").length,
    averageWaitSeconds: mean(waits),
    waitSamples: waits.length,
    averageServiceSeconds: mean(durations),
    serviceSamples: durations.length,
    demo: process.env.DEMO_MODE === "true",
  };
}
export type PublicService = Awaited<ReturnType<typeof services>>[number];
export type PrivateTicket = Awaited<ReturnType<typeof privateTicket>>;
export type StaffOverview = Awaited<ReturnType<typeof staffOverview>>;
