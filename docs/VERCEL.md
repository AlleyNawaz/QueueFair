# Deploy QueueFair to Vercel

## Build configuration

Use the Next.js framework preset, repository root `./`, Node 24, install command `pnpm install --frozen-lockfile`, and build command `pnpm build:vercel`. Keep the default Next.js output directory. The committed `vercel.json` enforces the Next.js framework and `pnpm build:vercel`, overriding any older dashboard build-command setting. Do not replace it with `next build` alone.

The ordinary local build script runs `prisma generate && next build`. Vercel uses `pnpm build:vercel`, which generates the client, applies committed migrations only when VERCEL_ENV=production and DATABASE_URL is present, bootstraps three fictional campus services and active counters only if the catalog is empty, then builds Next.js. Preview deployments never migrate or bootstrap a database automatically. Existing service catalogs are left untouched. The bootstrap creates no accounts, tickets, or synthetic history; those still require the explicit seed command and environment-provided passwords. The script never resets data. The generated client lives at `src/generated/prisma` and is intentionally ignored by Git; it must be generated on every build, including when dependencies are cached. This fixes `Module not found: Can't resolve '@/generated/prisma/client'`. See the [official Prisma 7 Vercel guidance](https://www.prisma.io/docs/orm/v7/more/troubleshooting/nextjs).

Generation does not apply migrations, seed the database, or require a live database connection. `prisma.config.ts` makes the URL optional for schema-only generation, so builds can finish before a database is attached. Database commands still require a real URL, and the running API returns a clear 503 `DATABASE_NOT_CONFIGURED` error until `DATABASE_URL` is supplied. A successful build alone does not mean the queue is operational.

## Required environment variables

Add these under the Vercel project’s Environment Variables settings for the intended deployment environment:

| Variable            | Value                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | Your hosted PostgreSQL connection string; use the provider’s serverless/pooled endpoint where supplied and its required TLS settings. A direct `postgresql://` or `postgres://` URL is required by this app’s pg adapter. |
| `APP_ORIGIN`        | Recommended exact HTTPS origin students and staff use, e.g. `https://your-project.vercel.app`, without a path. If omitted, mutations are checked against the request origin.                                              |
| `SESSION_SECRET`    | Recommended new random secret of at least 32 characters; generate locally with `openssl rand -hex 32`. If omitted, rate-limit HMAC uses the private DATABASE_URL as its key.                                              |
| `DEMO_MODE`         | `true` for a fictional demo; `false` for non-demo operation.                                                                                                                                                              |
| `ENABLE_DEMO_RESET` | `false`. No browser reset endpoint exists.                                                                                                                                                                                |

`127.0.0.1`, `localhost`, and the local Docker PostgreSQL service are not reachable as your laptop database from Vercel. Use a hosted PostgreSQL database. Never put database/session secrets in `NEXT_PUBLIC_` variables or commit them to the repository. [Vercel environment changes apply to new deployments](https://vercel.com/docs/environment-variables), so redeploy after editing them.

Use a separate database and matching `APP_ORIGIN` for Preview deployments. When APP_ORIGIN is set, opening the same deployment through a different host will deliberately reject mutations. If omitted, only same-origin mutations are accepted. Set a stable production URL/custom domain and use that URL for the demo.

## Initialize the database once

Production deployments now apply the committed migrations automatically when DATABASE_URL is configured. For a manual initialization or a Preview database, run the committed migrations against the hosted database using a private, ignored environment file on a trusted machine. Prisma CLI prefers DIRECT_URL, then DATABASE_URL_UNPOOLED, then DATABASE_URL. Set a provider’s direct/unpooled URL for migration operations if supplied; the running app continues to use DATABASE_URL. For manual initialization, keep these values in the private file.

```sh
# .env.vercel-db is a private local file containing the hosted DATABASE_URL.
# It must not contain your local development/test database URL.
node --env-file=.env.vercel-db node_modules/prisma/build/index.js migrate deploy
```

For a fresh fictional demo database, Production deploys create the three public service options and active counters if none exist. To also provision staff/admin accounts and synthetic walkthrough history, place `DEMO_MODE=true`, fresh `DEMO_STAFF_PASSWORD` and `DEMO_ADMIN_PASSWORD` values (at least 12 characters each) in that private file, then run:

```sh
node --env-file=.env.vercel-db node_modules/tsx/dist/cli.mjs prisma/seed.ts
```

Seed accepts either an empty database or the untouched bootstrap catalog; it refuses operational data and never overwrites existing accounts or tickets. This provisions `staff@queuefair.demo` and `admin@queuefair.demo` with those passwords. Password variables are needed by this explicit seed command, not by the running app, and changing them later does not reset stored password hashes. Do not use `demo:reset` to initialize or repair a deployed database. Builds never reset a database or create synthetic tickets/history. Only Production deploys apply committed schema migrations and create the initial service catalog if empty.

## Redeploy and verify

1. Push the build fix and select the latest commit in Vercel.
2. Confirm the build command is `pnpm build:vercel`; redeploy. If troubleshooting a stale deployment, uncheck “Use existing Build Cache” for that run. The normal build itself generates Prisma even with cached dependencies.
3. Build logs should show generated Prisma Client followed by the Next.js build.
4. Visit `/api/services`: after a Production migration, it should return the three starter services if the catalog was empty. A 503 `DATABASE_NOT_CONFIGURED` means `DATABASE_URL` is missing; a 500 requires checking runtime database/configuration logs.
5. At the exact `APP_ORIGIN`, join a service and verify `/my-tickets`; sign in as staff, call/start/complete; open the public display. Use HTTPS so production Secure cookies are sent.

No successful remote deployment is implied by a successful local build. Hosted credentials, migration state, project settings and the actual Vercel deployment must be verified separately.

## `PrismaConfigEnvError` during generation

If build logs show `prisma generate && next build` followed by `PrismaConfigEnvError: Cannot resolve environment variable`, the old Prisma config is requiring `DATABASE_URL` even for client generation. This repository now makes the datasource optional for schema-only commands, following [Prisma’s optional environment variable guidance](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference#handling-optional-environment-variables). Deploy the latest commit.

For the actual queue, open the **queuefair** project → **Environment Variables** and add `DATABASE_URL` for **Production** using your hosted PostgreSQL provider’s connection string. `APP_ORIGIN` and `SESSION_SECRET` are recommended hardening settings; same-origin and database-key fallbacks keep the queue usable if they are omitted. Preview variables are separate from Production. Do not use a localhost URL or a dummy database URL: they can allow a build to finish but cannot run the queue. Production migrations and the empty-catalog bootstrap run during deployment; seed staff/admin and synthetic history explicitly only when needed.

## Page loads but queues fail at runtime

A successful deployment can still return an API error if its database cannot be reached or has no QueueFair schema. Open `/api/services` on the same domain you are using. The API returns safe categories without exposing hosts, SQL, passwords or stack traces:

| Error code                     | Action                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| DATABASE_NOT_CONFIGURED        | Set the hosted DATABASE_URL in this project's Production environment, then redeploy.                                                   |
| DATABASE_NOT_INITIALIZED       | The Production build applies committed migrations automatically. For a manual or Preview setup, apply them explicitly.                 |
| DATABASE_ACCESS_FAILED         | Check the database credentials and permissions in the configured connection string.                                                    |
| DATABASE_CONFIGURATION_INVALID | Check the PostgreSQL URL format and database name.                                                                                     |
| DATABASE_UNAVAILABLE           | Check provider availability, reachable hostname/port, pooling and TLS settings. Do not disable certificate validation as a workaround. |

The latest verified production project is `queuefair`, served at `https://queuefair.vercel.app`. The older `queue-fair.vercel.app` alias returned Vercel `DEPLOYMENT_NOT_FOUND` on 2026-10-26; use the live `queuefair` domain. Do not infer that two project names share deployment settings or databases.

The directory now ends its initial loading state on failure and offers a retry. Retrying cannot repair missing tables or invalid credentials: those require correcting the hosted database setup above.

## Latest production check — 2026-10-26

GitHub reports Vercel deployment success for commit `312d3c37a19bf3a3bfdb4ca98463a124448afa67`. A public HTTP check of `https://queuefair.vercel.app/` returned 200, and `/api/services` returned 200 with `{ "data": [] }`. The API could read the migrated database, but the service catalog was empty, so students could not join a queue. The old `queue-fair.vercel.app` host returned Vercel `DEPLOYMENT_NOT_FOUND`.

To provision the fictional demo once, add `DEMO_MODE=true` and unique `DEMO_STAFF_PASSWORD` / `DEMO_ADMIN_PASSWORD` values (at least 12 characters) to a private `.env.vercel-db` containing the production `DATABASE_URL`, then run `node --env-file=.env.vercel-db node_modules/tsx/dist/cli.mjs prisma/seed.ts` from the repository root. Set `APP_ORIGIN=https://queuefair.vercel.app` and a fresh `SESSION_SECRET` in Vercel Production for explicit, stable configuration. Never commit or paste the secrets into chat. The seed command is intentionally not part of deploy builds and refuses operational data.
