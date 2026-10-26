import { db, type Tx } from "./db";
import type { Prisma, Service } from "@/generated/prisma/client";
import { assert } from "./errors";
import { hash } from "./auth";
import {
  canTransition,
  localDate,
  withinHours,
  graceElapsed,
  type Hours,
} from "@/lib/policy";
export type Actor = { kind: "OWNER" | "STAFF" | "SYSTEM"; id: string };
export const openNow = (s: Service, now: Date) =>
  s.state === "OPEN" && withinHours(now, s.timezone, s.weeklyHours as Hours);
export async function locked<T>(
  serviceId: string,
  fn: (tx: Tx, s: Service) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++)
    try {
      return await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Service" WHERE id = ${serviceId} FOR UPDATE`;
          const service = await tx.service.findUnique({
            where: { id: serviceId },
          });
          assert(service, 404, "NOT_FOUND", "Service not found.");
          return fn(tx, service);
        },
        { maxWait: 10000, timeout: 15000 },
      );
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (
        attempt < 2 &&
        (code === "P2034" || code === "40001" || code === "40P01")
      )
        continue;
      throw e;
    }
}
async function event(
  tx: Tx,
  ticketId: string,
  eventType: string,
  actor: Actor,
  metadata: Prisma.InputJsonObject = {},
  createdAt = new Date(),
) {
  await tx.ticketEvent.create({
    data: {
      ticketId,
      createdAt,
      eventType,
      actorKind: actor.kind,
      actorUserId: actor.kind === "STAFF" ? actor.id : null,
      metadata,
    },
  });
}
async function release(tx: Tx, ticketId: string) {
  await tx.activeParticipation.deleteMany({ where: { ticketId } });
}
async function rollover(tx: Tx, s: Service, now: Date) {
  const old = await tx.ticket.findMany({
    where: {
      serviceDay: {
        serviceId: s.id,
        localDate: { lt: localDate(now, s.timezone) },
      },
      status: { in: ["WAITING", "MISSED"] },
    },
  });
  for (const t of old) {
    await tx.ticket.update({
      where: { id: t.id },
      data: { status: "EXPIRED", expiredAt: now },
    });
    await release(tx, t.id);
    await event(
      tx,
      t.id,
      "EXPIRED",
      { kind: "SYSTEM", id: "rollover" },
      {},
      now,
    );
  }
}
export async function rolloverService(serviceId: string, now = new Date()) {
  return locked(serviceId, async (tx, s) => rollover(tx, s, now));
}
async function day(tx: Tx, s: Service, now: Date) {
  return tx.serviceDay.upsert({
    where: {
      serviceId_localDate: {
        serviceId: s.id,
        localDate: localDate(now, s.timezone),
      },
    },
    create: {
      serviceId: s.id,
      localDate: localDate(now, s.timezone),
      prefix: s.prefix,
    },
    update: {},
  });
}
async function idempotent<T extends Prisma.InputJsonValue>(
  tx: Tx,
  actor: string,
  operation: string,
  key: string,
  payload: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  assert(
    key && key.length >= 8 && key.length <= 128,
    400,
    "IDEMPOTENCY_REQUIRED",
    "Provide an Idempotency-Key of 8–128 characters.",
  );
  const payloadDigest = hash(JSON.stringify(payload));
  const old = await tx.idempotencyRecord.findUnique({
    where: { actor_operation_key: { actor, operation, key } },
  });
  if (old) {
    assert(
      old.payloadDigest === payloadDigest,
      409,
      "IDEMPOTENCY_CONFLICT",
      "This request key has already been used for different input.",
    );
    return old.result as T;
  }
  const result = await fn();
  await tx.idempotencyRecord.create({
    data: {
      actor,
      operation,
      key,
      payloadDigest,
      result,
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    },
  });
  return result;
}
export async function join(
  serviceId: string,
  ownerId: string,
  input: { reason: string; note?: string },
  key: string,
  now = new Date(),
) {
  return locked(serviceId, async (tx, s) =>
    idempotent(tx, ownerId, "join", key, { serviceId, ...input }, async () => {
      await rollover(tx, s, now);
      const d = await day(tx, s, now);
      const existing = await tx.activeParticipation.findUnique({
        where: {
          anonymousSessionId_serviceDayId: {
            anonymousSessionId: ownerId,
            serviceDayId: d.id,
          },
        },
        include: { ticket: true },
      });
      if (existing)
        return { publicId: existing.ticket.publicId, existing: true };
      assert(
        openNow(s, now),
        409,
        "SERVICE_CLOSED",
        "Joining is unavailable. Check the service hours and notice.",
      );
      assert(
        s.visitReasonOptions.includes(input.reason),
        422,
        "INVALID_REASON",
        "Choose a listed visit reason.",
      );
      const count = await tx.ticket.count({
        where: { serviceDayId: d.id, status: "WAITING" },
      });
      assert(
        count < s.maxWaitingTickets,
        409,
        "QUEUE_FULL",
        "This queue is full. Please try later.",
      );
      const t = await tx.ticket.create({
        data: {
          serviceDayId: d.id,
          anonymousSessionId: ownerId,
          tokenSequence: d.nextTokenSequence,
          tokenLabel: `${d.prefix}-${String(d.nextTokenSequence).padStart(3, "0")}`,
          queueSequence: d.nextQueueSequence,
          visitReasonCode: input.reason,
          note: input.note,
          joinedAt: now,
          queueEnteredAt: now,
        },
      });
      await tx.serviceDay.update({
        where: { id: d.id },
        data: {
          nextTokenSequence: { increment: 1 },
          nextQueueSequence: { increment: 1 },
        },
      });
      await tx.activeParticipation.create({
        data: {
          anonymousSessionId: ownerId,
          serviceDayId: d.id,
          ticketId: t.id,
        },
      });
      await event(tx, t.id, "JOINED", { kind: "OWNER", id: ownerId }, {}, now);
      return { publicId: t.publicId, existing: false };
    }),
  );
}
async function ticketFor(tx: Tx, publicId: string, ownerId: string) {
  const t = await tx.ticket.findFirst({
    where: { publicId, anonymousSessionId: ownerId },
    include: { serviceDay: true },
  });
  assert(t, 404, "NOT_FOUND", "Ticket not found in this browser.");
  return t;
}
export async function ownerCommand(
  publicId: string,
  ownerId: string,
  action: "cancel" | "rejoin",
  key: string,
  now = new Date(),
) {
  const lookup = await db.ticket.findFirst({
    where: { publicId, anonymousSessionId: ownerId },
    include: { serviceDay: true },
  });
  assert(lookup, 404, "NOT_FOUND", "Ticket not found in this browser.");
  return locked(lookup.serviceDay.serviceId, async (tx, s) => {
    const perform = async () => {
      await rollover(tx, s, now);
      const t = await ticketFor(tx, publicId, ownerId);
      if (action === "cancel") {
        assert(
          canTransition(t.status, "CANCELLED"),
          409,
          "INVALID_TRANSITION",
          "This ticket can no longer be cancelled.",
        );
        await tx.ticket.update({
          where: { id: t.id },
          data: {
            status: "CANCELLED",
            cancelledAt: now,
            assignedCounterId: null,
          },
        });
        await release(tx, t.id);
        await event(
          tx,
          t.id,
          "CANCELLED",
          { kind: "OWNER", id: ownerId },
          {},
          now,
        );
      } else {
        assert(
          t.status === "MISSED" &&
            t.rejoinCount === 0 &&
            t.serviceDay.localDate === localDate(now, s.timezone),
          409,
          "REJOIN_UNAVAILABLE",
          "A ticket can rejoin once on the same service day.",
        );
        assert(
          openNow(s, now),
          409,
          "SERVICE_CLOSED",
          "Rejoining is unavailable while joining is closed.",
        );
        const d = await tx.serviceDay.findUniqueOrThrow({
          where: { id: t.serviceDayId },
        });
        const count = await tx.ticket.count({
          where: { serviceDayId: d.id, status: "WAITING" },
        });
        assert(
          count < s.maxWaitingTickets,
          409,
          "QUEUE_FULL",
          "The queue is full. Try again shortly.",
        );
        await tx.ticket.update({
          where: { id: t.id },
          data: {
            status: "WAITING",
            queueSequence: d.nextQueueSequence,
            rejoinCount: 1,
            queueEnteredAt: now,
            calledAt: null,
            missedAt: null,
            assignedCounterId: null,
          },
        });
        await tx.serviceDay.update({
          where: { id: d.id },
          data: { nextQueueSequence: { increment: 1 } },
        });
        await event(
          tx,
          t.id,
          "REJOINED",
          { kind: "OWNER", id: ownerId },
          {},
          now,
        );
      }
      return { publicId };
    };
    return action === "rejoin"
      ? idempotent(tx, ownerId, "rejoin", key, { publicId }, perform)
      : perform();
  });
}
export async function counterCommand(
  counterId: string,
  userId: string,
  action: string,
  ticketId: string | undefined,
  key: string,
  reason?: string,
  now = new Date(),
) {
  const lookup = await db.counter.findUnique({ where: { id: counterId } });
  assert(lookup, 404, "NOT_FOUND", "Counter not found.");
  return locked(lookup.serviceId, async (tx, s) => {
    const perform = async () => {
      await rollover(tx, s, now);
      const c = await tx.counter.findUniqueOrThrow({
        where: { id: counterId },
      });
      const active = await tx.ticket.findFirst({
        where: {
          assignedCounterId: counterId,
          status: { in: ["CALLED", "SERVING"] },
        },
      });
      if (["activate", "resume", "pause", "close"].includes(action)) {
        if (action === "close")
          assert(
            !active,
            409,
            "ACTIVE_WORK",
            "Finish or resolve the active ticket before closing.",
          );
        if (action === "pause")
          assert(
            reason && reason.trim().length >= 3,
            422,
            "REASON_REQUIRED",
            "Give a visible pause reason.",
          );
        const state =
          action === "pause"
            ? "PAUSED"
            : action === "close"
              ? "OFFLINE"
              : "ACTIVE";
        await tx.counter.update({
          where: { id: counterId },
          data: { state, pauseReason: action === "pause" ? reason : null },
        });
        await tx.serviceEvent.create({
          data: {
            serviceId: s.id,
            counterId,
            eventType: `COUNTER_${state}`,
            actorUserId: userId,
            metadata: { reason: reason ?? "" },
          },
        });
        return { counterId };
      }
      if (action === "call-next") {
        assert(
          c.state === "ACTIVE",
          409,
          "COUNTER_INACTIVE",
          "Activate or resume this counter first.",
        );
        assert(
          !active,
          409,
          "ACTIVE_WORK",
          "Resolve the active ticket before calling next.",
        );
        assert(
          openNow(s, now),
          409,
          "SERVICE_CLOSED",
          "Calling is unavailable while joining is closed.",
        );
        const t = await tx.ticket.findFirst({
          where: {
            serviceDay: {
              serviceId: s.id,
              localDate: localDate(now, s.timezone),
            },
            status: "WAITING",
          },
          orderBy: { queueSequence: "asc" },
        });
        assert(t, 409, "QUEUE_EMPTY", "No tickets are waiting.");
        await tx.ticket.update({
          where: { id: t.id },
          data: {
            status: "CALLED",
            calledAt: now,
            assignedCounterId: counterId,
          },
        });
        await event(
          tx,
          t.id,
          "CALLED",
          { kind: "STAFF", id: userId },
          {
            counter: c.name,
            waitSeconds: Math.max(
              0,
              Math.round((+now - +t.queueEnteredAt) / 1000),
            ),
            attempt: t.rejoinCount + 1,
          },
          now,
        );
        return { ticketId: t.id };
      }
      assert(
        active && active.id === ticketId,
        409,
        "STALE_TICKET",
        "This ticket is no longer active at this counter. Refresh and try again.",
      );
      const next =
        action === "start"
          ? "SERVING"
          : action === "complete"
            ? "COMPLETED"
            : action === "miss"
              ? "MISSED"
              : "";
      assert(
        canTransition(active.status, next),
        409,
        "INVALID_TRANSITION",
        "That action is unavailable for this ticket.",
      );
      if (action === "miss")
        assert(
          active.calledAt &&
            graceElapsed(active.calledAt, s.gracePeriodSeconds, now),
          409,
          "GRACE_PERIOD",
          "The call grace period has not elapsed yet.",
        );
      const data: Prisma.TicketUpdateInput = { status: next };
      if (next === "SERVING") data.serviceStartedAt = now;
      if (next === "COMPLETED") data.completedAt = now;
      if (next === "MISSED") {
        data.missedAt = now;
        data.assignedCounter = { disconnect: true };
      }
      await tx.ticket.update({ where: { id: active.id }, data });
      if (
        next === "COMPLETED" ||
        (next === "MISSED" && active.rejoinCount >= 1)
      )
        await release(tx, active.id);
      await event(
        tx,
        active.id,
        next,
        { kind: "STAFF", id: userId },
        next === "COMPLETED"
          ? {
              serviceSeconds: Math.max(
                0,
                Math.round((+now - +(active.serviceStartedAt ?? now)) / 1000),
              ),
            }
          : {},
        now,
      );
      return { ticketId: active.id };
    };
    return ["call-next", "complete"].includes(action)
      ? idempotent(
          tx,
          userId,
          action,
          key,
          { counterId, ticketId: ticketId ?? null },
          perform,
        )
      : perform();
  });
}
export async function updateService(
  id: string,
  input: Prisma.ServiceUpdateInput,
  userId: string,
) {
  return locked(id, async (tx) => {
    const s = await tx.service.update({ where: { id }, data: input });
    await tx.serviceEvent.create({
      data: {
        serviceId: id,
        eventType: "SETTINGS_UPDATED",
        actorUserId: userId,
        metadata: { state: s.state, reason: s.pauseReason ?? "" },
      },
    });
    return { id };
  });
}
