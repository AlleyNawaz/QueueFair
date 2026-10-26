# Deploy QueueFair to Vercel

## Build configuration

Use the Next.js framework preset, repository root `./`, Node 24, install command `pnpm install --frozen-lockfile`, and build command `pnpm build`. Keep the default Next.js output directory. The committed `vercel.json` enforces the Next.js framework and `pnpm build`, overriding any older dashboard build-command setting. Do not replace it with `next build` alone.

The project’s build script runs `prisma generate && next build`. The generated client lives at `src/generated/prisma` and is intentionally ignored by Git; it must be generated on every build, including when dependencies are cached. This fixes `Module not found: Can't resolve '@/generated/prisma/client'`. See the [official Prisma 7 Vercel guidance](https://www.prisma.io/docs/orm/v7/more/troubleshooting/nextjs).

Generation does not apply migrations, seed the database, or require a live database connection. `prisma.config.ts` makes the URL optional for schema-only generation, so builds can finish before a database is attached. Database commands still require a real URL, and the running API returns a clear 503 `DATABASE_NOT_CONFIGURED` error until `DATABASE_URL` is supplied. A successful build alone does not mean the queue is operational.

## Required environment variables

Add these under the Vercel project’s Environment Variables settings for the intended deployment environment:

| Variable            | Value                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | Your hosted PostgreSQL connection string; use the provider’s serverless/pooled endpoint where supplied and its required TLS settings. A direct `postgresql://` or `postgres://` URL is required by this app’s pg adapter. |
| `APP_ORIGIN`        | The exact HTTPS origin students and staff use, e.g. `https://your-project.vercel.app`, without a path. This is checked on every mutation.                                                                                 |
| `SESSION_SECRET`    | A new random secret of at least 32 characters; generate locally with `openssl rand -hex 32`.                                                                                                                              |
| `DEMO_MODE`         | `true` for a fictional demo; `false` for non-demo operation.                                                                                                                                                              |
| `ENABLE_DEMO_RESET` | `false`. No browser reset endpoint exists.                                                                                                                                                                                |

`127.0.0.1`, `localhost`, and the local Docker PostgreSQL service are not reachable as your laptop database from Vercel. Use a hosted PostgreSQL database. Never put database/session secrets in `NEXT_PUBLIC_` variables or commit them to the repository. [Vercel environment changes apply to new deployments](https://vercel.com/docs/environment-variables), so redeploy after editing them.

Use a separate database and matching `APP_ORIGIN` for Preview deployments. Opening the same deployment through a different host than `APP_ORIGIN` will deliberately reject mutations. Set a stable production URL/custom domain and use that URL for the demo.

## Initialize the database once

Before using the app, run the committed migrations against the hosted database using a private, ignored environment file on a trusted machine. If the provider offers a separate direct connection for migrations, use that connection for this step.

```sh
# .env.vercel-db is a private local file containing the hosted DATABASE_URL.
# It must not contain your local development/test database URL.
node --env-file=.env.vercel-db node_modules/prisma/build/index.js migrate deploy
```

For a fresh fictional demo database, also place `DEMO_MODE=true`, fresh `DEMO_STAFF_PASSWORD` and `DEMO_ADMIN_PASSWORD` values (at least 12 characters each) in that private file, then run:

```sh
node --env-file=.env.vercel-db node_modules/tsx/dist/cli.mjs prisma/seed.ts
```

Seed refuses a non-empty database. This provisions `staff@queuefair.demo` and `admin@queuefair.demo` with those passwords. Password variables are needed by this explicit seed command, not by the running app, and changing them later does not reset stored password hashes. Do not use `demo:reset` to initialize or repair a deployed database. Builds never reset or seed databases automatically.

## Redeploy and verify

1. Push the build fix and select the latest commit in Vercel.
2. Confirm the build command is `pnpm build`; redeploy. If troubleshooting a stale deployment, uncheck “Use existing Build Cache” for that run. The normal build itself generates Prisma even with cached dependencies.
3. Build logs should show generated Prisma Client followed by the Next.js build.
4. Visit `/api/services`: after migrations/seed, it should return `{ "data": [...] }`. An empty list means no services are configured; a 503 `DATABASE_NOT_CONFIGURED` means `DATABASE_URL` is missing; a 500 requires checking runtime database/configuration logs.
5. At the exact `APP_ORIGIN`, join a service and verify `/my-tickets`; sign in as staff, call/start/complete; open the public display. Use HTTPS so production Secure cookies are sent.

No successful remote deployment is implied by a successful local build. Hosted credentials, migration state, project settings and the actual Vercel deployment must be verified separately.

## `PrismaConfigEnvError` during generation

If build logs show `prisma generate && next build` followed by `PrismaConfigEnvError: Cannot resolve environment variable`, the old Prisma config is requiring `DATABASE_URL` even for client generation. This repository now makes the datasource optional for schema-only commands, following [Prisma’s optional environment variable guidance](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference#handling-optional-environment-variables). Deploy the latest commit.

For the actual queue, open the **queuefair** project → **Environment Variables**, add `DATABASE_URL` for **Production** using your hosted PostgreSQL provider’s connection string, and redeploy. Set `APP_ORIGIN` to the canonical HTTPS domain you will use and `SESSION_SECRET` to a fresh random value of at least 32 characters. Preview variables are separate from Production. Do not use a localhost URL or a dummy database URL: they can allow a build to finish but cannot run the queue. Apply migrations and seed the fresh demo database explicitly as above.
