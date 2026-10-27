import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const secret = () => randomBytes(24).toString("hex");
const password = secret();
const template = readFileSync(
  new URL("../.env.example", import.meta.url),
  "utf8",
)
  .replaceAll("replace-with-random-local-password", password)
  .replace("generate-at-least-32-random-characters", secret())
  .replace("DEMO_STAFF_PASSWORD=\n", `DEMO_STAFF_PASSWORD=${secret()}\n`)
  .replace("DEMO_ADMIN_PASSWORD=\n", `DEMO_ADMIN_PASSWORD=${secret()}\n`)
  .replace(
    "DEMO_HOSTEL_OFFICER_PASSWORD=\n",
    `DEMO_HOSTEL_OFFICER_PASSWORD=${secret()}\n`,
  )
  .replace(
    "DEMO_SPORTS_OFFICER_PASSWORD=\n",
    `DEMO_SPORTS_OFFICER_PASSWORD=${secret()}\n`,
  );
writeFileSync(new URL("../.env", import.meta.url), template, {
  flag: "wx",
  mode: 0o600,
});
console.log(
  "Created .env with fresh local secrets. Read it locally for demo passwords; existing files are never overwritten.",
);
