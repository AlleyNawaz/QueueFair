import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { db } from "../../src/server/db";
import {
  join,
  counterCommand,
  ownerCommand,
  rolloverService,
  locked,
  updateService,
} from "../../src/server/queue";
import { publicState, privateTicket } from "../../src/server/reads";
import { randomUUID } from "node:crypto";
const now = new Date("2026-10-26T08:00:00Z");
let sid: string;
let staff: string;
let c1: string;
let c2: string;
beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !url.pathname.endsWith("_test") ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  )
    throw new Error(
      "Refusing cleanup: dedicated TEST_DATABASE_URL ending _test required.",
    );
});
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Service", "User", "AnonymousSession", "IdempotencyRecord", "RateLimitBucket" CASCADE',
  );
  const user = await db.user.create({
    data: {
      email: "test@example.test",
      displayName: "Test",
      role: "STAFF",
      passwordHash: "unused",
    },
  });
  staff = user.id;
  const s = await db.service.create({
    data: {
      slug: "test",
      name: "Test service",
      prefix: "TEST",
      description: "Test",
      location: "Test location",
      weeklyHours: {
        days: [0, 1, 2, 3, 4, 5, 6],
        open: "00:00",
        close: "23:59",
      },
      visitReasonOptions: ["Help"],
      documentRequirements: [],
    },
  });
  sid = s.id;
  c1 = (
    await db.counter.create({
      data: { serviceId: sid, name: "Counter 1", state: "ACTIVE" },
    })
  ).id;
  c2 = (
    await db.counter.create({
      data: { serviceId: sid, name: "Counter 2", state: "ACTIVE" },
    })
  ).id;
});
afterAll(() => db.$disconnect());
async function owner() {
  return (
    await db.anonymousSession.create({
      data: {
        hashedSecret: randomUUID(),
        expiresAt: new Date(+now + 86400_000),
      },
    })
  ).id;
}
const add = async (o?: string, k = randomUUID()) =>
  join(sid, o ?? (await owner()), { reason: "Help" }, k, now);
const call = (c = c1, k = randomUUID()) =>
  counterCommand(c, staff, "call-next", undefined, k, undefined, now);
const command = (
  action: string,
  ticketId: string,
  c = c1,
  at = now,
  k = randomUUID(),
) => counterCommand(c, staff, action, ticketId, k, undefined, at);
it("concurrent joins allocate unique tokens and ordering", async () => {
  await Promise.all(Array.from({ length: 12 }, () => add()));
  const ts = await db.ticket.findMany();
  expect(new Set(ts.map((t) => t.tokenSequence)).size).toBe(12);
  expect(new Set(ts.map((t) => t.queueSequence)).size).toBe(12);
});
it("same browser concurrent requests return one participation and replay rejects payload changes", async () => {
  const o = await owner(),
    key = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) => add(o, i % 2 ? key : randomUUID())),
  );
  expect(new Set(results.map((t) => t.publicId)).size).toBe(1);
  expect(await db.activeParticipation.count()).toBe(1);
  await expect(
    join(sid, o, { reason: "Help", note: "changed" }, key, now),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("two counters never claim the same ticket", async () => {
  await add();
  await add();
  const r = await Promise.all([call(c1), call(c2)]);
  expect(new Set(r.map((t) => (t as { ticketId: string }).ticketId)).size).toBe(
    2,
  );
});
it("two calls at one counter cannot replace active work", async () => {
  await add();
  await add();
  const r = await Promise.allSettled([call(), call()]);
  expect(r.filter((v) => v.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.ticket.count({
      where: { assignedCounterId: c1, status: "CALLED" },
    }),
  ).toBe(1);
});
it("completion replay creates one event and permits finishing after closure", async () => {
  await add();
  const t = (await call()) as { ticketId: string };
  await command("start", t.ticketId);
  await updateService(
    sid,
    { state: "CLOSED", pauseReason: "End of day" },
    staff,
  );
  const key = randomUUID();
  await command("complete", t.ticketId, c1, new Date(+now + 360000), key);
  await command("complete", t.ticketId, c1, new Date(+now + 360000), key);
  expect(
    await db.ticketEvent.count({ where: { eventType: "COMPLETED" } }),
  ).toBe(1);
  expect(await db.activeParticipation.count()).toBe(0);
});
it("cancel racing call-next remains valid and releases counter", async () => {
  const o = await owner(),
    t = await add(o);
  await Promise.allSettled([
    call(),
    ownerCommand(t.publicId, o, "cancel", "", now),
  ]);
  const actual = await db.ticket.findUniqueOrThrow({
    where: { publicId: t.publicId },
  });
  expect(actual.status).toBe("CANCELLED");
  expect(actual.assignedCounterId).toBeNull();
  expect(await db.activeParticipation.count()).toBe(0);
});
it("grace is enforced; rejoin moves to tail, once only", async () => {
  const o = await owner();
  const t = await add(o);
  const called = (await call()) as { ticketId: string };
  await expect(
    command("miss", called.ticketId, c1, new Date(+now + 119999)),
  ).rejects.toMatchObject({ code: "GRACE_PERIOD" });
  await command("miss", called.ticketId, c1, new Date(+now + 120000));
  await add();
  await ownerCommand(
    t.publicId,
    o,
    "rejoin",
    randomUUID(),
    new Date(+now + 121000),
  );
  const tickets = await db.ticket.findMany({
    orderBy: { queueSequence: "asc" },
  });
  expect(tickets.at(-1)?.publicId).toBe(t.publicId);
  expect(tickets.at(-1)?.tokenLabel).toBe("TEST-001");
  await call();
  await call(c2);
  await command("miss", called.ticketId, c2, new Date(+now + 130000));
  await expect(
    ownerCommand(
      t.publicId,
      o,
      "rejoin",
      randomUUID(),
      new Date(+now + 131000),
    ),
  ).rejects.toMatchObject({ code: "REJOIN_UNAVAILABLE" });
});
it("rejoin racing cancellation produces one coherent terminal state", async () => {
  const o = await owner(),
    t = await add(o);
  const called = (await call()) as { ticketId: string };
  await command("miss", called.ticketId, c1, new Date(+now + 120000));
  await Promise.allSettled([
    ownerCommand(
      t.publicId,
      o,
      "rejoin",
      randomUUID(),
      new Date(+now + 121000),
    ),
    ownerCommand(t.publicId, o, "cancel", "", new Date(+now + 121000)),
  ]);
  expect(
    (await db.ticket.findUniqueOrThrow({ where: { publicId: t.publicId } }))
      .status,
  ).toBe("CANCELLED");
  expect(await db.activeParticipation.count()).toBe(0);
});
it("rejoin racing call-next keeps one active assignment", async () => {
  const o = await owner(),
    t = await add(o);
  const called = (await call()) as { ticketId: string };
  await command("miss", called.ticketId, c1, new Date(+now + 120000));
  await Promise.allSettled([
    ownerCommand(
      t.publicId,
      o,
      "rejoin",
      randomUUID(),
      new Date(+now + 121000),
    ),
    call(),
  ]);
  const current = await db.ticket.findUniqueOrThrow({
    where: { publicId: t.publicId },
  });
  expect(["WAITING", "CALLED"]).toContain(current.status);
  expect(await db.activeParticipation.count()).toBe(1);
});
it("a transaction failure rolls back updates and audit records", async () => {
  const t = await add();
  await expect(
    locked(sid, async (tx) => {
      await tx.ticket.updateMany({ data: { status: "CANCELLED" } });
      await tx.ticketEvent.create({
        data: {
          ticketId: (await tx.ticket.findFirstOrThrow()).id,
          eventType: "CANCELLED",
          actorKind: "SYSTEM",
        },
      });
      throw new Error("injected failure");
    }),
  ).rejects.toThrow("injected failure");
  expect(
    (await db.ticket.findUniqueOrThrow({ where: { publicId: t.publicId } }))
      .status,
  ).toBe("WAITING");
  expect(
    await db.ticketEvent.count({ where: { eventType: "CANCELLED" } }),
  ).toBe(0);
});
it("rollover expires waiting/missed, preserves active work/history, and is idempotent", async () => {
  await add();
  await add();
  await call();
  await rolloverService(sid, new Date("2026-10-27T08:00:00Z"));
  await rolloverService(sid, new Date("2026-10-27T08:00:00Z"));
  expect(await db.ticket.count({ where: { status: "EXPIRED" } })).toBe(1);
  expect(await db.ticket.count({ where: { status: "CALLED" } })).toBe(1);
  expect(await db.ticketEvent.count({ where: { eventType: "EXPIRED" } })).toBe(
    1,
  );
});
it("private ownership is checked, public DTO omits private fields", async () => {
  const o = await owner(),
    t = await add(o);
  await expect(privateTicket(t.publicId, await owner())).rejects.toMatchObject({
    status: 404,
  });
  const dto = (await publicState(sid, now)).dto;
  const json = JSON.stringify(dto);
  for (const key of [
    "anonymousSessionId",
    "visitReasonCode",
    "note",
    "hashedSecret",
    "passwordHash",
  ])
    expect(json).not.toContain(`"${key}"`);
});
it("paused/closed and hours block joins/calls without losing ordering", async () => {
  await add();
  await updateService(sid, { state: "PAUSED", pauseReason: "Lunch" }, staff);
  await expect(add()).rejects.toMatchObject({ code: "SERVICE_CLOSED" });
  await expect(call()).rejects.toMatchObject({ code: "SERVICE_CLOSED" });
  expect(await db.ticket.count({ where: { status: "WAITING" } })).toBe(1);
});
