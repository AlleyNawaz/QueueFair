# Local office-queue workload check

The campus population of roughly 15,000 enrolled students is not a concurrent-user target. No test in this repository claims 15,000 simultaneous clients. This repeatable check measures a small local PostgreSQL workload and verifies that the queue stays fair under concurrent joins.

## Reproduce

Create a separate PostgreSQL database named with `_test`, set both `DATABASE_URL` and `TEST_DATABASE_URL` to its loopback connection string in ignored `.env.test`, then run:

```sh
pnpm db:migrate:test
pnpm test:load
```

The test validates URL equality, loopback hostname, and `_test` suffix before truncating data. `QUEUEFAIR_LOAD_JOINS=100 pnpm test:load` raises the same-office burst from the default 40 (maximum 100). Never point `.env.test` at development, preview, or production data.

## Measured local run — 2026-10-27

Environment: local PostgreSQL 16 at loopback, isolated `queuefair_test`, five synthetic office services and one active configured counter each.

| Workload or metric                                           |                                       Observed result |
| ------------------------------------------------------------ | ----------------------------------------------------: |
| Simultaneous distinct-owner joins to one office              |                                                    40 |
| Join burst wall time                                         |                                                856 ms |
| Join transaction latency, p50 / p95 / p99                    |                                    380 / 500 / 514 ms |
| Join errors                                                  |                                                     0 |
| Directory read-service calls                                 | 50 (10 concurrent × 5 rounds), each reading 5 offices |
| Directory read latency, p50 / p95 / p99                      |                                       42 / 48 / 48 ms |
| Poll/read errors                                             |                                                     0 |
| Maximum sampled PostgreSQL connections for the test database |                                                    10 |
| Samples observing a PostgreSQL lock wait                     |                                                     6 |
| Unique ticket tokens / queue sequences                       |                                               40 / 40 |
| Contiguous per-office FIFO allocation                        |            Passed; the next join received sequence 41 |

These are one local sample, not a production SLO or a public-network API benchmark. The polling path invokes the same server read service used by `/api/services`, but the measurement omits browser/network/Vercel overhead. The activity sampler polls `pg_stat_activity` every 10 ms; lock-wait samples are observations, not total lock-wait duration. The test does not measure tail latency under a long run, cache behavior, cross-region traffic, or 15,000 connected browsers.

## Capacity and assumptions

The scenario assumes five office queues, five operator counters, one 40-join burst to one office, and 10 clients polling a five-office directory view per round. A service-row lock serializes mutations within a service, preserving FIFO. Independent services do not share that lock. For a real busy-hour target, agree on burst size, request rate, acceptable p95/p99, database connection limit and failure rate, then repeat the test on an isolated deployment that matches the target provider. Measure API latency, lock duration, errors, and database connections before making a capacity claim.

The Prisma 7 `pg` adapter uses a PostgreSQL pool; the local run observed 10 connections, the default maximum documented by the [`pg` Pool API](https://node-postgres.com/apis/pool). With serverless instances, the potential aggregate is per-instance pool size multiplied by concurrently warm instances. Configure provider pooling (for example PgBouncer/serverless pool), Vercel function concurrency and connection limits together; a client-side singleton alone does not cap connections across serverless instances. See [Vercel connection pooling guidance](https://vercel.com/kb/guide/connection-pooling-with-functions) and [Prisma v7 connection pool settings](https://docs.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool). No hosted provider or production pool has been load-tested here.

## Meeting-request code verification sample — 2026-10-27

A second isolated loopback run completed after the meeting-review model and handlers were added. It used the same guarded `_test` database and workload dimensions above.

| Workload or metric                      |                            Observed result |
| --------------------------------------- | -----------------------------------------: |
| Simultaneous joins to one office        |                                         40 |
| Join burst wall time                    |                                     934 ms |
| Join latency, p50 / p95 / p99           |                         422 / 584 / 594 ms |
| Join errors                             |                                          0 |
| Five-office directory reads             |                                         50 |
| Directory-read latency, p50 / p95 / p99 |                            50 / 63 / 64 ms |
| Poll/read errors                        |                                          0 |
| Maximum sampled PostgreSQL connections  |                                         10 |
| Lock-wait samples                       |                                          7 |
| Unique queue tokens and order sequences |                                    40 / 40 |
| FIFO allocation                         | Passed; the next join received sequence 41 |

This local sample includes the schema and query changes for meeting requests; it does not stress concurrent requests competing for an accepted meeting time. That path is covered by an integration race test, not by this load run. No production capacity claim is made.
