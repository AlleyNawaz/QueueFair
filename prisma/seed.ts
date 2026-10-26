import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash as passwordHash } from "argon2";
import { createHash, randomBytes } from "node:crypto";
import { localDate } from "../src/lib/policy";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
export async function seed() {
  if (process.env.DEMO_MODE !== "true")
    throw new Error("Seed requires DEMO_MODE=true.");
  const staffPassword = process.env.DEMO_STAFF_PASSWORD,
    adminPassword = process.env.DEMO_ADMIN_PASSWORD;
  if (
    !staffPassword ||
    !adminPassword ||
    Math.min(staffPassword.length, adminPassword.length) < 12
  )
    throw new Error(
      "Set unique demo passwords of at least 12 characters in .env.",
    );
  if (await db.service.count())
    throw new Error(
      "Database is not empty. Seed refuses to overwrite existing data; use guarded demo:reset explicitly.",
    );
  const staff = await db.user.create({
    data: {
      email: "staff@queuefair.demo",
      displayName: "Campus Staff",
      role: "STAFF",
      passwordHash: await passwordHash(staffPassword),
    },
  });
  await db.user.create({
    data: {
      email: "admin@queuefair.demo",
      displayName: "Campus Administrator",
      role: "ADMIN",
      passwordHash: await passwordHash(adminPassword),
    },
  });
  const now = new Date();
  const fixtures = [
    {
      name: "Student Affairs",
      slug: "student-affairs",
      prefix: "SA",
      description:
        "Documents, campus records, and guidance for your student journey.",
      location: "Student Centre · Room 104",
      duration: 360,
      counters: 2,
      reasons: ["Document collection", "Campus records", "General enquiry"],
      docs: [
        "Relevant application or reference number",
        "Supporting documents for your request",
      ],
    },
    {
      name: "Finance Desk",
      slug: "finance-desk",
      prefix: "FIN",
      description:
        "Fee enquiries, payment verification, and financial assistance.",
      location: "Admin Block · Ground floor",
      duration: 480,
      counters: 2,
      reasons: ["Fee enquiry", "Payment verification", "Financial assistance"],
      docs: [
        "Fee challan or payment reference, if applicable",
        "Relevant supporting documents",
      ],
    },
    {
      name: "IT Help Desk",
      slug: "it-help-desk",
      prefix: "IT",
      description:
        "A helping hand with campus Wi-Fi, accounts, and technical issues.",
      location: "Library Building · Room 012",
      duration: 600,
      counters: 1,
      reasons: ["Wi-Fi access", "Account help", "Technical issue"],
      docs: [
        "Your device, if the issue is device-specific",
        "A description of the issue",
      ],
    },
  ];
  for (const f of fixtures) {
    const s = await db.service.create({
      data: {
        name: f.name,
        slug: f.slug,
        prefix: f.prefix,
        description: f.description,
        location: f.location,
        defaultServiceSeconds: f.duration,
        gracePeriodSeconds: Number(process.env.DEMO_GRACE_SECONDS ?? 10),
        notice: "Demo data · shortened call grace for the walkthrough.",
        weeklyHours: {
          days: [0, 1, 2, 3, 4, 5, 6],
          open: "00:00",
          close: "23:59",
        },
        documentRequirements: f.docs,
        visitReasonOptions: f.reasons,
      },
    });
    const counters = [];
    for (let i = 1; i <= f.counters; i++)
      counters.push(
        await db.counter.create({
          data: { serviceId: s.id, name: `Counter ${i}`, state: "ACTIVE" },
        }),
      );
    await db.staffAssignment.create({
      data: { userId: staff.id, serviceId: s.id },
    });
    const d = await db.serviceDay.create({
      data: {
        serviceId: s.id,
        localDate: localDate(now),
        prefix: s.prefix,
        nextTokenSequence: 16,
        nextQueueSequence: 16,
      },
    });
    for (let i = 1; i <= 15; i++) {
      const completed = i <= 8;
      const status = completed
        ? "COMPLETED"
        : i === 9
          ? "SERVING"
          : i === 10 && counters.length > 1
            ? "CALLED"
            : i === 11
              ? "MISSED"
              : "WAITING";
      const owner = await db.anonymousSession.create({
        data: {
          hashedSecret: createHash("sha256")
            .update(randomBytes(32))
            .digest("hex"),
          expiresAt: new Date(+now + 30 * 86400_000),
        },
      });
      const joinedAt = new Date(
        +now - (completed ? 90 - i * 6 : 18 - i) * 60000,
      );
      const calledAt = ["COMPLETED", "SERVING", "CALLED", "MISSED"].includes(
        status,
      )
        ? new Date(+joinedAt + 120000)
        : null;
      const serviceStartedAt = ["COMPLETED", "SERVING"].includes(status)
        ? new Date(completed ? +calledAt! + 15000 : +now - 120000)
        : null;
      const completedAt = completed
        ? new Date(
            +serviceStartedAt! + (f.duration + ((i % 3) - 1) * 45) * 1000,
          )
        : null;
      const c =
        status === "SERVING"
          ? counters[0]
          : status === "CALLED"
            ? counters[1]
            : null;
      const t = await db.ticket.create({
        data: {
          serviceDayId: d.id,
          anonymousSessionId: owner.id,
          tokenSequence: i,
          queueSequence: i,
          tokenLabel: `${s.prefix}-${String(i).padStart(3, "0")}`,
          status,
          visitReasonCode: f.reasons[0],
          note: "Synthetic demo ticket",
          joinedAt,
          queueEnteredAt: joinedAt,
          calledAt,
          serviceStartedAt,
          completedAt,
          missedAt: status === "MISSED" ? new Date(+now - 60000) : null,
          assignedCounterId: c?.id,
        },
      });
      await db.ticketEvent.create({
        data: {
          ticketId: t.id,
          eventType: "JOINED",
          actorKind: "SYSTEM",
          createdAt: joinedAt,
          metadata: { synthetic: true },
        },
      });
      if (calledAt)
        await db.ticketEvent.create({
          data: {
            ticketId: t.id,
            eventType: "CALLED",
            actorKind: "STAFF",
            actorUserId: staff.id,
            createdAt: calledAt,
            metadata: {
              counter: c?.name ?? "Counter 1",
              waitSeconds: 120,
              attempt: 1,
              synthetic: true,
            },
          },
        });
      if (serviceStartedAt)
        await db.ticketEvent.create({
          data: {
            ticketId: t.id,
            eventType: "SERVING",
            actorKind: "STAFF",
            actorUserId: staff.id,
            createdAt: serviceStartedAt,
          },
        });
      if (completedAt)
        await db.ticketEvent.create({
          data: {
            ticketId: t.id,
            eventType: "COMPLETED",
            actorKind: "STAFF",
            actorUserId: staff.id,
            createdAt: completedAt,
          },
        });
      if (status === "MISSED")
        await db.ticketEvent.create({
          data: {
            ticketId: t.id,
            eventType: "MISSED",
            actorKind: "STAFF",
            actorUserId: staff.id,
            createdAt: new Date(+now - 60000),
          },
        });
      if (!completed)
        await db.activeParticipation.create({
          data: {
            anonymousSessionId: owner.id,
            serviceDayId: d.id,
            ticketId: t.id,
          },
        });
    }
  }
  console.log(
    "Seeded three fictional campus services and synthetic history. Passwords were read from the environment.",
  );
}
if (process.argv[1]?.endsWith("seed.ts"))
  seed().finally(() => db.$disconnect());
export { db as seedDb };
