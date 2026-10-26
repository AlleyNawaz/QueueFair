import "dotenv/config";
import { db } from "../src/server/db";
import { rolloverService } from "../src/server/queue";
for (const s of await db.service.findMany({ select: { id: true } }))
  await rolloverService(s.id);
await db.$disconnect();
