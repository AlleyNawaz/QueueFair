import { spawnSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
function run(args) {
  const result = spawnSync(pnpm, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["db:generate"]);
if (
  process.env.VERCEL_ENV === "production" &&
  process.env.DATABASE_URL?.trim()
) {
  // Migrations are additive; catalog bootstrap only adds starter rows to an
  // empty catalog and never resets ticket, account, or service data.
  run(["db:migrate"]);
  run(["db:catalog"]);
} else {
  console.log(
    "Skipping database migrations outside a configured Production deployment.",
  );
}
run(["exec", "next", "build"]);
