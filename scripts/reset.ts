import "dotenv/config";
import { seed, seedDb } from "../prisma/seed";
async function reset() {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    process.env.DEMO_MODE !== "true" ||
    !url.pathname.endsWith("_demo") ||
    process.env.NODE_ENV === "production" ||
    !process.argv.includes("--confirm")
  )
    throw new Error(
      "Reset refused: requires DEMO_MODE=true, non-production, database name ending _demo, and --confirm.",
    );
  await seedDb.$executeRawUnsafe(
    'TRUNCATE "Service", "User", "AnonymousSession", "IdempotencyRecord", "RateLimitBucket" CASCADE',
  );
  await seed();
}
reset().finally(() => seedDb.$disconnect());
