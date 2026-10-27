import { afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/server/db";
import { join } from "../../src/server/queue";
import { services } from "../../src/server/reads";

const databaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const size = Math.min(
  100,
  Math.max(1, Number(process.env.QUEUEFAIR_LOAD_JOINS ?? 40)),
);
function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)],
  );
}

afterAll(() => db.$disconnect());

it("measures an isolated office join burst and polling across five offices", async () => {
  if (!databaseUrl || databaseUrl !== testDatabaseUrl) {
    throw new Error(
      "Load test requires DATABASE_URL to exactly match TEST_DATABASE_URL.",
    );
  }
  const url = new URL(databaseUrl);
  if (
    !url.hostname.match(/^(127\.0\.0\.1|localhost|::1)$/) ||
    !url.pathname.endsWith("_test")
  ) {
    throw new Error(
      "Load test refuses non-loopback databases and names not ending _test.",
    );
  }
  await db.$executeRawUnsafe(
    'TRUNCATE "Service", "User", "AnonymousSession", "IdempotencyRecord", "RateLimitBucket" CASCADE',
  );
  const offices: { id: string }[] = [];
  const prefixes = ["OONE", "OTWO", "OTRI", "OFOR", "OFIV"];
  for (let i = 0; i < 5; i++) {
    const office = await db.service.create({
      data: {
        serviceType: "OFFICE",
        allowNote: true,
        name: `Load Office ${i + 1}`,
        slug: `load-office-${i + 1}`,
        prefix: prefixes[i]!,
        description: "Isolated office queue workload fixture.",
        location: `Test building · Office ${i + 1}`,
        weeklyHours: {
          days: [0, 1, 2, 3, 4, 5, 6],
          open: "00:00",
          close: "23:59",
        },
        visitReasonOptions: ["General enquiry"],
        documentRequirements: [],
        maxWaitingTickets: 1000,
      },
    });
    offices.push(office);
    await db.counter.create({
      data: { serviceId: office.id, name: "Office", state: "ACTIVE" },
    });
  }

  const joinDurations: number[] = [];
  let joinErrors = 0;
  let maxConnections = 0;
  let lockWaitSamples = 0;
  let observing = true;
  const observer = (async () => {
    while (observing) {
      try {
        const [row] = await db.$queryRaw<
          { connections: bigint; lockWaits: bigint }[]
        >`
          SELECT COUNT(*)::bigint AS connections,
            COUNT(*) FILTER (WHERE wait_event_type = 'Lock')::bigint AS "lockWaits"
          FROM pg_stat_activity WHERE datname = current_database()`;
        maxConnections = Math.max(
          maxConnections,
          Number(row?.connections ?? 0),
        );
        if (Number(row?.lockWaits ?? 0) > 0) lockWaitSamples++;
      } catch {
        // Keep the workload useful if the local role cannot read activity details.
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  })();
  const started = Date.now();
  try {
    const settled = await Promise.allSettled(
      Array.from({ length: size }, async () => {
        const owner = await db.anonymousSession.create({
          data: {
            hashedSecret: randomUUID(),
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
        const at = performance.now();
        try {
          return await join(
            offices[0]!.id,
            owner.id,
            { reason: "General enquiry", note: "Synthetic load note" },
            randomUUID(),
          );
        } finally {
          joinDurations.push(performance.now() - at);
        }
      }),
    );
    joinErrors = settled.filter((r) => r.status === "rejected").length;
  } finally {
    observing = false;
    await observer;
  }
  const tickets = await db.ticket.findMany({
    where: { serviceDay: { serviceId: offices[0]!.id }, status: "WAITING" },
    orderBy: { queueSequence: "asc" },
    select: { tokenSequence: true, queueSequence: true },
  });
  const uniqueTokens = new Set(tickets.map((t) => t.tokenSequence)).size;
  const uniqueOrder = new Set(tickets.map((t) => t.queueSequence)).size;
  const contiguous = tickets.every(
    (t, i) => t.queueSequence === i + 1 && t.tokenSequence === i + 1,
  );
  const laterOwner = await db.anonymousSession.create({
    data: {
      hashedSecret: randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const later = await join(
    offices[0]!.id,
    laterOwner.id,
    { reason: "General enquiry" },
    randomUUID(),
  );
  const laterTicket = await db.ticket.findUniqueOrThrow({
    where: { publicId: later.publicId },
  });

  const pollDurations: number[] = [];
  let pollErrors = 0;
  for (let round = 0; round < 5; round++) {
    const batch = await Promise.allSettled(
      Array.from({ length: 10 }, async () => {
        const at = performance.now();
        try {
          return await services();
        } finally {
          pollDurations.push(performance.now() - at);
        }
      }),
    );
    pollErrors += batch.filter((r) => r.status === "rejected").length;
  }
  const report = {
    environment: "loopback PostgreSQL isolated _test database",
    joins: size,
    joinBurstMilliseconds: Date.now() - started,
    joinLatencyMs: {
      p50: percentile(joinDurations, 0.5),
      p95: percentile(joinDurations, 0.95),
      p99: percentile(joinDurations, 0.99),
    },
    joinErrors,
    pollingRequests: pollDurations.length,
    pollingLatencyMs: {
      p50: percentile(pollDurations, 0.5),
      p95: percentile(pollDurations, 0.95),
      p99: percentile(pollDurations, 0.99),
    },
    pollErrors,
    officesPolledPerRequest: 5,
    maxObservedDbConnections: maxConnections,
    lockWaitSamples,
    uniqueTokens,
    uniqueOrderSequences: uniqueOrder,
    contiguousFifoAllocation: contiguous,
    subsequentJoinSequence: laterTicket.queueSequence,
  };
  console.log(`QUEUEFAIR_LOCAL_LOAD_REPORT ${JSON.stringify(report)}`);
  expect(joinErrors).toBe(0);
  expect(pollErrors).toBe(0);
  expect(tickets).toHaveLength(size);
  expect(uniqueTokens).toBe(size);
  expect(uniqueOrder).toBe(size);
  expect(contiguous).toBe(true);
  expect(laterTicket.queueSequence).toBe(size + 1);
}, 120_000);
