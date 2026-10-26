import "dotenv/config";
import { defineConfig } from "prisma/config";

// Client generation only needs the schema. Database commands still require a URL.
const databaseUrl = process.env.DATABASE_URL?.trim();
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: databaseUrl ? { url: databaseUrl } : undefined,
});
