import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl)
  throw new Error("DATABASE_URL is required to bootstrap the catalog.");

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
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

try {
  let created = false;
  try {
    created = await db.$transaction(async (tx) => {
      if ((await tx.service.count()) > 0) return false;

      for (const fixture of fixtures) {
        const service = await tx.service.create({
          data: {
            name: fixture.name,
            slug: fixture.slug,
            prefix: fixture.prefix,
            description: fixture.description,
            location: fixture.location,
            defaultServiceSeconds: fixture.duration,
            gracePeriodSeconds: 10,
            notice: "Fictional Cedar Campus demo service.",
            weeklyHours: {
              days: [0, 1, 2, 3, 4, 5, 6],
              open: "00:00",
              close: "23:59",
            },
            documentRequirements: fixture.docs,
            visitReasonOptions: fixture.reasons,
          },
        });
        await tx.counter.createMany({
          data: Array.from({ length: fixture.counters }, (_, index) => ({
            serviceId: service.id,
            name: `Counter ${index + 1}`,
            state: "ACTIVE",
          })),
        });
      }
      return true;
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      // Concurrent production builds may both observe an empty catalog; the
      // unique slug constraint lets one win and rolls the other transaction back.
      console.log("Another deployment initialized the catalog concurrently.");
    } else {
      throw error;
    }
  }

  console.log(
    created
      ? "Bootstrapped the three fictional campus services and active counters. No accounts, tickets, or history were created."
      : "Catalog already contains services; no production records were changed.",
  );
} finally {
  await db.$disconnect();
}
