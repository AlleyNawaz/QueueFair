# Contributing

Follow the [README](README.md) to install Node 24 LTS, pnpm, and PostgreSQL 16. Keep credentials in ignored environment files. Work on a branch and preserve existing changes.

Keep queue rules in `src/server/queue.ts` and pure policy in `src/lib/policy.ts`. Every privileged handler must authenticate and authorize on the server. Public DTOs must select fields explicitly. Add a migration for schema changes; retain custom partial indexes and checks. Never delete historical tickets as a normal operation.

Before proposing a change, run format:check, lint, typecheck, unit, integration, E2E, and production build. Use a separate `_test` database for destructive fixture cleanup; never bypass its guards. Update documentation and include actual results and any environmental blockers in the pull request. Add regression tests for changes to ordering, authorization, idempotency, or transitions.

No external service credentials are needed. Do not include secrets, real student information, fabricated impact metrics, or institutional branding in examples.
