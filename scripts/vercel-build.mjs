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
  // deploy only applies committed migrations; it never resets or seeds data.
  run(["db:migrate"]);
} else {
  console.log(
    "Skipping database migrations outside a configured Production deployment.",
  );
}
run(["exec", "next", "build"]);
