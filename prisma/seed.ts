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
    adminPassword = process.env.DEMO_ADMIN_PASSWORD,
    hostelPassword = process.env.DEMO_HOSTEL_OFFICER_PASSWORD,
    sportsPassword = process.env.DEMO_SPORTS_OFFICER_PASSWORD;
  if (
    !staffPassword ||
    !adminPassword ||
    !hostelPassword ||
    !sportsPassword ||
    Math.min(
      staffPassword.length,
      adminPassword.length,
      hostelPassword.length,
      sportsPassword.length,
    ) < 12
  )
    throw new Error(
      "Set unique demo passwords of at least 12 characters in .env.",
    );
  const fixtures = [
    {
      name: "Student Affairs",
      slug: "student-affairs",
      prefix: "SA",
      description: "Documents, campus records, and student guidance.",
      location: "Student Centre · Room 104",
      duration: 360,
      reasons: ["Document collection", "Campus records", "General enquiry"],
      docs: [
        "Relevant application or reference number",
        "Supporting documents",
      ],
      serviceType: "DESK",
      allowNote: false,
      state: "OPEN",
      pauseReason: null,
      counters: 2,
      officerEmail: null,
      gracePeriodSeconds: Number(process.env.DEMO_GRACE_SECONDS ?? 10),
    },
    {
      name: "Finance Desk",
      slug: "finance-desk",
      prefix: "FIN",
      description:
        "Fee enquiries, payment verification, and financial assistance.",
      location: "Cedar Hall · Ground floor",
      duration: 480,
      reasons: ["Fee enquiry", "Payment verification", "Financial assistance"],
      docs: [
        "Fee challan or payment reference, if applicable",
        "Supporting documents",
      ],
      serviceType: "DESK",
      allowNote: false,
      state: "OPEN",
      pauseReason: null,
      counters: 2,
      officerEmail: null,
      gracePeriodSeconds: Number(process.env.DEMO_GRACE_SECONDS ?? 10),
    },
    {
      name: "IT Help Desk",
      slug: "it-help-desk",
      prefix: "IT",
      description: "Help with campus Wi-Fi, accounts, and technical issues.",
      location: "Library Building · Room 012",
      duration: 600,
      reasons: ["Wi-Fi access", "Account help", "Technical issue"],
      docs: [
        "Your device, if the issue is device-specific",
        "A short issue description",
      ],
      serviceType: "DESK",
      allowNote: false,
      state: "OPEN",
      pauseReason: null,
      counters: 1,
      officerEmail: null,
      gracePeriodSeconds: Number(process.env.DEMO_GRACE_SECONDS ?? 10),
    },
    {
      name: "Cedar Hostel Office",
      slug: "cedar-hostel-office",
      prefix: "HOST",
      description:
        "Same-day walk-in line for residence questions and facilities.",
      location: "Cedar Residence · Office 2",
      duration: 420,
      reasons: ["Room access", "Maintenance follow-up", "General enquiry"],
      docs: ["Relevant room or request reference"],
      serviceType: "OFFICE",
      allowNote: true,
      state: "PAUSED",
      pauseReason: "In a meeting; existing queue order is preserved.",
      counters: 1,
      officerEmail: "hostel.officer@queuefair.demo",
      gracePeriodSeconds: Number(process.env.DEMO_OFFICE_GRACE_SECONDS ?? 30),
    },
    {
      name: "Campus Activities Office",
      slug: "campus-activities-office",
      prefix: "ACT",
      description:
        "Same-day walk-in line for sports facilities and campus activities.",
      location: "Cedar Hall · Activities Office",
      duration: 480,
      reasons: ["Sports facilities", "Team registration", "Campus activity"],
      docs: ["Any relevant team or facility reference"],
      serviceType: "OFFICE",
      allowNote: true,
      state: "OPEN",
      pauseReason: null,
      counters: 1,
      officerEmail: "sports.officer@queuefair.demo",
      gracePeriodSeconds: Number(process.env.DEMO_OFFICE_GRACE_SECONDS ?? 30),
    },
  ];
  const [existingServices, existingUsers, existingTickets, existingDays] =
    await Promise.all([
      db.service.findMany({ select: { slug: true } }),
      db.user.count(),
      db.ticket.count(),
      db.serviceDay.count(),
    ]);
  if (
    existingUsers > 0 ||
    existingTickets > 0 ||
    existingDays > 0 ||
    existingServices.some((s) => !fixtures.some((f) => f.slug === s.slug))
  )
    throw new Error(
      "Database contains operational data. Seed refuses to overwrite it; use guarded demo:reset only for a disposable local demo database.",
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
  const hostelOfficer = await db.user.create({
    data: {
      email: "hostel.officer@queuefair.demo",
      displayName: "Hostel Office Officer",
      role: "STAFF",
      passwordHash: await passwordHash(hostelPassword),
    },
  });
  const sportsOfficer = await db.user.create({
    data: {
      email: "sports.officer@queuefair.demo",
      displayName: "Campus Activities Officer",
      role: "STAFF",
      passwordHash: await passwordHash(sportsPassword),
    },
  });
  const officers = new Map([
    ["hostel.officer@queuefair.demo", hostelOfficer],
    ["sports.officer@queuefair.demo", sportsOfficer],
  ]);
  const now = new Date();
  for (const f of fixtures) {
    const s = await db.service.upsert({
      where: { slug: f.slug },
      update: {},
      create: {
        serviceType: f.serviceType,
        allowNote: f.allowNote,
        name: f.name,
        slug: f.slug,
        prefix: f.prefix,
        description: f.description,
        location: f.location,
        defaultServiceSeconds: f.duration,
        state: f.state,
        pauseReason: f.pauseReason,
        gracePeriodSeconds: f.gracePeriodSeconds,
        notice:
          f.serviceType === "OFFICE"
            ? "Same-day walk-in line · not an appointment. Estimates can change while the office is in a meeting."
            : "Demo data · synthetic queue history.",
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
        await db.counter.upsert({
          where: {
            serviceId_name: {
              serviceId: s.id,
              name: f.serviceType === "OFFICE" ? "Office" : `Counter ${i}`,
            },
          },
          update: {},
          create: {
            serviceId: s.id,
            name: f.serviceType === "OFFICE" ? "Office" : `Counter ${i}`,
            state: "ACTIVE",
          },
        }),
      );
    if (f.officerEmail) {
      const officer = officers.get(f.officerEmail)!;
      await db.staffAssignment.create({
        data: {
          userId: officer.id,
          serviceId: s.id,
          counterId: null,
        },
      });
    } else {
      await db.staffAssignment.create({
        data: {
          userId: staff.id,
          serviceId: s.id,
        },
      });
    }
    if (f.serviceType === "OFFICE" && f.state === "PAUSED")
      await db.serviceEvent.create({
        data: {
          serviceId: s.id,
          eventType: "OFFICE_MEETING_PAUSED",
          actorUserId: officers.get(f.officerEmail!)!.id,
          metadata: { reason: f.pauseReason ?? "In a meeting" },
        },
      });
    const fixtureCount =
      f.serviceType === "OFFICE"
        ? f.state === "PAUSED"
          ? 1
          : 0
        : f.slug === "finance-desk"
          ? 6
          : 9;
    const d = await db.serviceDay.create({
      data: {
        serviceId: s.id,
        localDate: localDate(now),
        prefix: s.prefix,
        nextTokenSequence: fixtureCount + 1,
        nextQueueSequence: fixtureCount + 1,
      },
    });
    for (let i = 1; i <= fixtureCount; i++) {
      const completed = f.serviceType !== "OFFICE" && i <= 5;
      const status = completed
        ? "COMPLETED"
        : f.serviceType === "OFFICE"
          ? "WAITING"
          : f.slug === "finance-desk"
            ? "MISSED"
            : i === 6
              ? "SERVING"
              : i === 7 && counters.length > 1
                ? "CALLED"
                : i === 8
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
          note: f.allowNote
            ? "Synthetic demo note; no sensitive information."
            : null,
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
    "Seeded fictional campus desks and same-day office queues with synthetic ticket history. Credentials were read from the environment.",
  );
}
if (process.argv[1]?.endsWith("seed.ts"))
  seed().finally(() => db.$disconnect());
export { db as seedDb };
