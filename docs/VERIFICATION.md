# Verification record

Executed locally on 2026-10-26 with Node 26.12.0, pnpm 11.25.0 and PostgreSQL 16.15 on macOS. All results below describe actual commands. CI was authored but has not run remotely.

| Check                                     | Actual result                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`          | PASS; lockfile installs without changes                                                                                       |
| `pnpm peers check`                        | PASS; no peer dependency issues                                                                                               |
| Prisma schema validate / client generate  | PASS; Prisma 7.10.1                                                                                                           |
| `pnpm db:migrate`, `pnpm db:migrate:test` | PASS; committed migration applied to separate demo/test databases                                                             |
| `pnpm db:seed`                            | PASS; three services, five counters, synthetic history and environment-provided account passwords                             |
| `pnpm db:rollover`                        | PASS; explicit command executes without startup reset                                                                         |
| `pnpm test`                               | PASS; 60 deterministic domain tests                                                                                           |
| `pnpm test:integration`                   | PASS; 13 PostgreSQL integration/concurrency tests                                                                             |
| `pnpm test:e2e`                           | PASS; 9 Chromium browser tests, separate guarded `_test` database                                                             |
| `pnpm lint`                               | PASS; no warnings/errors                                                                                                      |
| `pnpm typecheck`                          | PASS; strict TypeScript                                                                                                       |
| `pnpm format:check`                       | PASS                                                                                                                          |
| `pnpm build`                              | PASS; optimized Next.js 16.4.3 production build                                                                               |
| `pnpm start --port 3002`                  | PASS; production server started locally                                                                                       |
| Production Chromium smoke                 | PASS; student join/ownership/cancel, staff login/workspace/logout, admin login/analytics and public display; zero page errors |
| Responsive visual checks                  | PASS; actual 375px and 1440px screenshots; 1920px wall display; mobile service and wall display had no horizontal overflow    |
| Docker Compose execution                  | NOT RUN; Docker is not installed in this environment                                                                          |
| Remote CI / public deploy / GitHub push   | NOT RUN; no publishing performed                                                                                              |
| Recorded fallback video                   | NOT CREATED; recording instructions are in DEMO.md                                                                            |

## Coverage

Unit tests exhaustively check all 49 state pairs, grace before/at/after boundary, one rejoin / same-day / open policy, Karachi and UTC midnight, weekday/hour boundaries, zero/parallel counters, serving/called occupancy, baseline fallback, FIFO tail positions and outlier handling.

Integration tests use a dedicated database and explicit destructive guards. They cover unique concurrent token/order allocation, duplicate joins from one established owner, two-counter claims, one-counter duplicate calls, idempotency mismatch and completion replay, cancellation/call races, rejoin/call and rejoin/cancel races, grace, tail ordering, transaction rollback, rollover, owner isolation/public DTO fields, and pause/closed joining/call restrictions.

Browser tests cover a student-owned join surviving refresh; separate staff calls/starts/completes and student polling; cancellation confirmation; missed/rejoin/second rejection; admin pause visible in student/display; anonymous and staff authorization, counter restrictions, ownership, CSRF and absent reset endpoint; mobile/RTL; keyboard flows; stale refresh; generic credential errors, persistent login limits and logout revocation.

## Failures encountered and resolved

- Initial dependency selection had incompatible ESLint/TypeScript peers. Selected the compatible versions recorded in DECISIONS.md; peer check now passes.
- The environment loader CLI conflicted with a dependency binary. Test scripts now use Node’s explicit `--env-file=.env.test`; the unused CLI dependency was removed.
- Playwright initially failed loading Prisma’s ESM generated client. The application is now an explicit ESM package.
- First browser run could not launch because Chromium was not installed. Downloaded the matching Playwright browser and reran successfully.
- ESLint initially picked up `.next-e2e` generated files. Generated output is now consistently ignored by lint, formatting and Git.
- Hooks lint caught render-time ref effects and clocks. Sound runs in an effect and operator elapsed time uses the server’s polled sync timestamp.

## Artifacts

Actual production-browser screenshots are committed under `docs/screenshots`: directory desktop/mobile, private ticket desktop/mobile, staff workspace, token-only public display, and aggregate analytics. The captured student ticket was cancelled after capture, leaving no stray waiting participation. Credentials/cookie values were not included in captures or logs.

Remaining scope: long-form Urdu translations, push notifications, CSV export and advanced administration (account provisioning/assignment removal) are not implemented. The prototype uses browser identity, heuristic estimates, polling and local/global abuse limits as documented. No manual security audit, real campus validation, real-world impact, Kiro usage or production deployment is claimed.
